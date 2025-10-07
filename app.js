const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");
const User = require("./models/user");
const Post = require("./models/post");
const { sequelize } = require("./config/database");
const { ClubRequest } = require("./models/clubRequest");
const { Event } = require("./models/event");
const { EventReport } = require("./models/eventReport");
const { Application } = require("./models/application");
const { Subscription } = require("./models/subscription");
const { RSVP } = require("./models/rsvp");

// ===== Model Associations =====
// Event → Club(User)
try {
  Event.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn("Association setup warning (Event→User):", e?.message || e);
}
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRSVPEmail,
} = require("./config/mailer");
const { AuditLog } = require("./models/auditLog");
const crypto = require("crypto");
require("dotenv").config();
const app = express();

// ===== Middleware =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: "clubhub-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours absolute max
      httpOnly: true,
    },
  })
);

// 15-minute idle timeout
app.use((req, res, next) => {
  const now = Date.now();
  const idleLimitMs = 15 * 60 * 1000;
  if (
    req.session &&
    req.session.lastActivityAt &&
    now - req.session.lastActivityAt > idleLimitMs
  ) {
    req.session.destroy(() => {
      return res.redirect("/login");
    });
    return;
  }
  if (req.session) req.session.lastActivityAt = now;
  next();
});

// ===== File Upload Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ===== Helper =====
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ===== Routes =====

// Home redirect
app.get("/", (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === "student")
      return res.redirect(`/student/${req.session.user.id}/home`);
    else if (req.session.user.role === "club")
      return res.redirect(`/club/${req.session.user.id}`);
    else if (req.session.user.role === "admin")
      return res.redirect(`/admin/${req.session.user.id}`);
  }
  res.redirect("/landing");
});

// ===== Landing =====
app.get("/landing", (req, res) => res.render("landing"));

// ===== Signup =====
app.get("/signup", (req, res) =>
  res.render("signup", { error: null, message: null })
);

app.post("/signup", async (req, res) => {
  const { role } = req.body;
  let username, email, password, confirmPassword, profileData;

  try {
    if (role === "student") {
      // === Student signup ===
      const {
        fullName,
        studentEmail,
        studentPassword,
        studentConfirmPassword,
      } = req.body;
      email = studentEmail.trim().toLowerCase();
      username = fullName.trim();
      password = studentPassword;
      confirmPassword = studentConfirmPassword;

      profileData = {
        fullName: username,
        bio: "",
        email,
        phone: "",
        linkedin: "",
        profilePic: "",
        cv: "",
      };

      if (!email)
        return res.render("signup", { error: "Invalid email!", message: null });

      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
      if (!passwordOk)
        return res.render("signup", {
          error:
            "Password must be at least 8 characters and include letters and numbers.",
          message: null,
        });

      // length covered by regex above; keep confirm check below
      if (password !== confirmPassword)
        return res.render("signup", {
          error: "Passwords do not match!",
          message: null,
        });

      // ensure email is unique
      const existingByEmail = await User.findOne({ where: { email } });
      if (existingByEmail)
        return res.render("signup", {
          error: "Email already exists!",
          message: null,
        });

      const hashedPassword = await bcrypt.hash(password, 10);

      const verificationToken = crypto.randomBytes(20).toString("hex");
      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        role: "student",
        profile_data: profileData,
        verificationToken,
      });

      await sendVerificationEmail(newUser.email, verificationToken);

      return res.render("signup", {
        error: null,
        message:
          "A verification email has been sent to your email address. Please verify your email to login.",
      });
    } else if (role === "club") {
      // === Club signup → save as ClubRequest instead of User ===
      const {
        clubName,
        clubEmail,
        clubDescription,
        representativeName,
        clubPassword,
        clubConfirmPassword,
      } = req.body;
      email = clubEmail.trim().toLowerCase();
      username = clubName.trim();
      password = clubPassword;
      confirmPassword = clubConfirmPassword;

      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
      if (!passwordOk)
        return res.render("signup", {
          error:
            "Password must be at least 8 characters and include letters and numbers.",
          message: null,
        });
      if (password !== confirmPassword)
        return res.render("signup", {
          error: "Passwords do not match!",
          message: null,
        });

      // uniqueness: email and club name
      const existingClubEmail = await User.findOne({ where: { email } });
      if (existingClubEmail)
        return res.render("signup", {
          error: "Email already exists!",
          message: null,
        });
      const existingPendingReqEmail = await ClubRequest.findOne({
        where: { clubEmail: email, status: "pending" },
      });
      if (existingPendingReqEmail)
        return res.render("signup", {
          error: "A pending request with this email already exists.",
          message: null,
        });

      // unique club name among existing clubs and pending requests
      const normalizedClubName = username.trim();
      const existingClubName = await User.findOne({
        where: { username: normalizedClubName, role: "club" },
      });
      if (existingClubName)
        return res.render("signup", {
          error: "Club name already taken.",
          message: null,
        });
      const existingPendingClubName = await ClubRequest.findOne({
        where: { clubName: normalizedClubName, status: "pending" },
      });
      if (existingPendingClubName)
        return res.render("signup", {
          error: "A pending request with this club name already exists.",
          message: null,
        });

      const hashedPassword = await bcrypt.hash(password, 10);

      await ClubRequest.create({
        clubName: username,
        clubEmail: email,
        passwordHash: hashedPassword,
        clubDescription,
        representativeName,
        status: "pending",
      });

      return res.render("signup", {
        error: null,
        message:
          "Your club request has been submitted. Please wait for admin approval.",
      });
    } else {
      return res.render("signup", {
        error: "Please select a role",
        message: null,
      });
    }
  } catch (err) {
    console.error(err);
    if (err.name === "SequelizeUniqueConstraintError")
      return res.render("signup", {
        error: "Email already exists!",
        message: null,
      });
    res.render("signup", { error: "Something went wrong!", message: null });
  }
});

// ===== Email Verification =====
app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token)
    return res.render("login", { error: "Invalid verification link." });

  try {
    const user = await User.findOne({ where: { verificationToken: token } });
    if (!user)
      return res.render("login", { error: "Invalid verification link." });

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    res.render("login", {
      error: null,
      message: "Email verified successfully. You can now login.",
    });
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Something went wrong!" });
  }
});

// ===== Login =====
app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.render("login", { error: "User not found!" });

    if (!user.isVerified) {
      return res.render("login", {
        error: "Please verify your email before logging in.",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("login", { error: "Invalid credentials!" });

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile_data: user.profile_data,
    };

    if (user.role === "student") res.redirect(`/student/${user.id}/home`);
    else if (user.role === "club") res.redirect(`/club/${user.id}`);
    else if (user.role === "admin") res.redirect(`/admin/${user.id}`);
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Something went wrong!" });
  }
});

// ===== Password Reset =====
app.get("/forgot-password", (req, res) => {
  res.render("login", { error: null, message: null });
});

app.post("/forgot-password", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ where: { email } });
  if (!user)
    return res.render("login", {
      error: null,
      message: "If the email exists, a reset link was sent.",
    });
  const token = crypto.randomBytes(20).toString("hex");
  user.resetToken = token;
  user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  await sendPasswordResetEmail(user.email, token);
  res.render("login", {
    error: null,
    message: "If the email exists, a reset link was sent.",
  });
});

app.get("/reset-password", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.render("login", { error: "Invalid reset link." });
  const user = await User.findOne({ where: { resetToken: token } });
  if (
    !user ||
    !user.resetTokenExpiresAt ||
    user.resetTokenExpiresAt < new Date()
  )
    return res.render("login", { error: "Reset link expired or invalid." });
  res.render("signup", {
    error: null,
    message: "Enter new password on the form.",
  });
});

app.post("/reset-password", async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  if (!token) return res.render("login", { error: "Invalid reset link." });
  if (password !== confirmPassword)
    return res.render("login", { error: "Passwords do not match." });
  const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
  if (!passwordOk)
    return res.render("login", {
      error:
        "Password must be at least 8 characters and include letters and numbers.",
    });
  const user = await User.findOne({ where: { resetToken: token } });
  if (
    !user ||
    !user.resetTokenExpiresAt ||
    user.resetTokenExpiresAt < new Date()
  )
    return res.render("login", { error: "Reset link expired or invalid." });
  user.password = await bcrypt.hash(password, 10);
  user.resetToken = null;
  user.resetTokenExpiresAt = null;
  await user.save();
  res.render("login", {
    error: null,
    message: "Password reset successful. Please log in.",
  });
});

// ===== Logout =====
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Admin - view pending club requests
app.get("/admin/club-requests", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const requests = await ClubRequest.findAll({
    where: { status: "pending" },
    order: [["createdAt", "ASC"]],
  });
  res.render("admin-club-request", { requests });
});

// Approve
app.post("/admin/club-requests/:id/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const reqId = req.params.id;
  const creq = await ClubRequest.findByPk(reqId);
  if (!creq) return res.status(404).send("Not found");

  try {
    // Uniqueness checks to avoid DB constraint errors
    const existingByEmail = await User.findOne({
      where: { email: creq.clubEmail },
    });
    if (existingByEmail) {
      return res
        .status(400)
        .send("Cannot approve: email already in use by another account.");
    }
    const existingClubName = await User.findOne({
      where: { username: creq.clubName, role: "club" },
    });
    if (existingClubName) {
      return res.status(400).send("Cannot approve: club name already taken.");
    }

    await sequelize.transaction(async (t) => {
      await User.create(
        {
          username: creq.clubName,
          email: creq.clubEmail,
          password: creq.passwordHash,
          role: "club",
          isVerified: true, // Clubs are verified by admin approval
          profile_data: {
            clubDescription: creq.clubDescription,
            representativeName: creq.representativeName,
          },
        },
        { transaction: t }
      );

      creq.status = "approved";
      await creq.save({ transaction: t });
    });

    res.redirect("/admin/club-requests");
  } catch (err) {
    console.error("Approve club request failed:", err);
    return res.status(500).send("Failed to approve club request.");
  }
});

// Reject
app.post("/admin/club-requests/:id/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const reqId = req.params.id;
  const creq = await ClubRequest.findByPk(reqId);
  if (!creq) return res.status(404).send("Not found");
  creq.status = "rejected";
  creq.adminNotes = req.body.adminNotes || "";
  await creq.save();
  res.redirect("/admin/club-requests");
});

// ===== Post Approval =====
app.get("/admin/posts", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const posts = await Post.findAll({
    where: { status: "pending" },
    order: [["createdAt", "ASC"]],
  });
  res.render("adminPosts", { posts });
});

app.post("/admin/posts/:id/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const post = await Post.findByPk(req.params.id);
  if (!post) return res.status(404).send("Not found");
  post.status = "approved";
  await post.save();
  res.redirect("/admin/posts");
});

app.post("/admin/posts/:id/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const post = await Post.findByPk(req.params.id);
  if (!post) return res.status(404).send("Not found");
  post.status = "rejected";
  await post.save();
  res.redirect("/admin/posts");
});

// ===== Student Home =====
app.get("/student/:id/home", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "student")
    return res.status(404).send("Student not found");

  const subs = await Subscription.findAll({ where: { studentId: user.id } });
  const subscribedClubIds = subs.map((s) => s.clubId);

  const allPosts = await Post.findAll({
    where: { status: "approved" },
    order: [["createdAt", "DESC"]],
  });
  const subPosts = subscribedClubIds.length
    ? await Post.findAll({
        where: { status: "approved", clubId: subscribedClubIds },
        order: [["createdAt", "DESC"]],
      })
    : [];
  const upcomingSubscribedEvents = subscribedClubIds.length
    ? await Event.findAll({
        where: { status: "approved", clubId: subscribedClubIds },
        order: [["startsAt", "ASC"]],
      })
    : [];

  res.render("homepage", {
    user,
    allPosts,
    subPosts,
    upcomingSubscribedEvents,
  });
});

// ===== Student Profile =====
app.get("/student/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "student")
    return res.status(404).send("Student not found");

  res.render("studentProfile", { user, posts: [] });
});

// ===== Club Profile =====
app.get("/club/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "club")
    return res.status(404).send("Club not found");

  // Fetch club posts
  const posts = await Post.findAll({
    where: { clubId: user.id }, // include pending/approved/rejected for club view
    order: [["createdAt", "DESC"]],
  });

  // Fetch all events for this club (pending/approved/rejected)
  const events = await Event.findAll({
    where: { clubId: user.id },
    order: [["startsAt", "ASC"]],
  });

  res.render("clubProfile", { user, posts, events });
});
// Browse clubs
app.get("/student/:id/clubs", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "student" ||
    req.session.user.id != req.params.id
  )
    return res.status(403).send("Forbidden");
  const user = await User.findByPk(req.params.id);
  const q = (req.query.q || "").trim().toLowerCase();
  const clubs = await User.findAll({
    where: { role: "club" },
    order: [["username", "ASC"]],
  });
  const subs = await Subscription.findAll({ where: { studentId: user.id } });
  const subSet = new Set(subs.map((s) => s.clubId));
  const filtered = clubs.filter(
    (c) =>
      !q ||
      c.username.toLowerCase().includes(q) ||
      (c.profile_data?.clubDescription || "").toLowerCase().includes(q)
  );
  const decorated = filtered.map((c) => ({
    ...c.toJSON(),
    isSubscribed: subSet.has(c.id),
  }));
  res.render("clubs", { user, clubs: decorated, q });
});

app.post(
  "/student/:id/clubs/:clubId/subscribe",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "student" ||
      req.session.user.id != req.params.id
    )
      return res.status(403).send("Forbidden");
    const club = await User.findByPk(req.params.clubId);
    if (!club || club.role !== "club")
      return res.status(404).send("Club not found");
    await Subscription.findOrCreate({
      where: { studentId: req.session.user.id, clubId: club.id },
    });
    res.redirect(`/student/${req.params.id}/clubs`);
  }
);

app.post(
  "/student/:id/clubs/:clubId/unsubscribe",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "student" ||
      req.session.user.id != req.params.id
    )
      return res.status(403).send("Forbidden");
    await Subscription.destroy({
      where: { studentId: req.session.user.id, clubId: req.params.clubId },
    });
    res.redirect(`/student/${req.params.id}/clubs`);
  }
);

// RSVP to events
app.post(
  "/student/:id/events/:eventId/rsvp",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "student" ||
      req.session.user.id != req.params.id
    )
      return res.status(403).send("Forbidden");
    const { status } = req.body; // going | interested | not_going
    const event = await Event.findByPk(req.params.eventId);
    if (!event || event.status !== "approved")
      return res.status(404).send("Event not found");
    // capacity enforcement if set
    if (event.capacity && (status || "going") === "going") {
      const goingCount = await RSVP.count({
        where: { eventId: event.id, status: "going" },
      });
      if (goingCount >= event.capacity)
        return res.status(400).send("Event is at full capacity.");
    }
    await RSVP.upsert({
      studentId: req.session.user.id,
      eventId: event.id,
      status: status || "going",
    });
    // send confirmation
    const student = await User.findByPk(req.session.user.id);
    if (student) {
      try {
        await sendRSVPEmail(student.email, event);
      } catch (e) {
        console.error("RSVP email error", e);
      }
    }
    res.redirect(`/student/${req.params.id}/home`);
  }
);
// Admin: send reminders for events starting within next 24h
app.post("/admin/events/:eventId/remind", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const event = await Event.findByPk(req.params.eventId);
  if (!event || event.status !== "approved")
    return res.status(404).send("Event not found");
  const rsvps = await RSVP.findAll({
    where: { eventId: event.id, status: "going" },
  });
  const students = await User.findAll({
    where: { id: rsvps.map((r) => r.studentId) },
  });
  for (const s of students) {
    try {
      await sendRSVPEmail(s.email, event);
    } catch (e) {
      console.error("reminder email error", e);
    }
  }
  res.redirect("/admin/events");
});

// ===== Add Post (Club only) =====
app.post(
  "/club/:id/addPost",
  requireLogin,
  upload.single("media"),
  async (req, res) => {
    try {
      const club = await User.findByPk(req.params.id);
      if (!club || club.role !== "club")
        return res.status(403).send("Invalid club");

      const text = req.body.content?.trim() || ""; // matches your textarea name

      let image = null;
      let video = null;

      if (req.file) {
        console.log("Uploaded file:", req.file); // debug
        if (req.file.mimetype.startsWith("image/"))
          image = "/uploads/" + req.file.filename;
        else if (req.file.mimetype.startsWith("video/"))
          video = "/uploads/" + req.file.filename;
      }

      await Post.create({
        clubId: club.id,
        text,
        image,
        video,
        status: "pending",
      });
      res.redirect(`/club/${club.id}`);
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

// Delete a post (Club only, any status)
app.post("/club/:id/posts/:postId/delete", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");
  const post = await Post.findByPk(req.params.postId);
  if (!post || post.clubId != req.params.id)
    return res.status(404).send("Post not found");
  await post.destroy();
  res.redirect(`/club/${req.params.id}`);
});

// Club: create event form
app.get("/club/:id/event/new", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");
  res.render("eventForm", { error: null, clubId: req.params.id });
});

app.post("/club/:id/event/new", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");
  const { title, description, location, startsAt, endsAt, capacity } = req.body;
  await Event.create({
    clubId: req.session.user.id,
    title,
    description,
    location,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    capacity: capacity ? parseInt(capacity) : null,
    status: "pending",
  });
  res.redirect(`/club/${req.session.user.id}`);
});

// Delete an event (Club only)
app.post("/club/:id/events/:eventId/delete", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");
  const event = await Event.findByPk(req.params.eventId);
  if (!event || event.clubId != req.params.id)
    return res.status(404).send("Event not found");
  await event.destroy();
  res.redirect(`/club/${req.params.id}`);
});

// Admin view pending events
app.get("/admin/events", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");

  const pendingEvents = await Event.findAll({
    where: { status: "pending" },
    include: [
      { model: User, as: "club", attributes: ["id", "username", "email"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  res.render("AdminEvents", { pendingEvents });
});

// Approve
app.post("/admin/events/:eventId/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");

  event.status = "approved";
  await event.save();

  res.redirect("/admin/events");
});

// Reject
app.post("/admin/events/:eventId/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");

  event.status = "rejected";
  event.adminNotes = req.body.adminNotes || "";
  await event.save();

  res.redirect("/admin/events");
});

// show report form
app.get("/club/:id/event/:eventId/report", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");
  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");
  res.render("eventReportForm", { event, error: null });
});

// submit report
app.post(
  "/club/:id/event/:eventId/report",
  requireLogin,
  upload.array("attachments", 5),
  async (req, res) => {
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.id
    )
      return res.status(403).send("Forbidden");
    const { summary, attendeesCount } = req.body;
    const attachments = (req.files || []).map((f) =>
      f.path.replace(/\\/g, "/")
    );
    await EventReport.create({
      eventId: req.params.eventId,
      clubId: req.session.user.id,
      summary,
      attendeesCount: parseInt(attendeesCount) || 0,
      attachments,
    });
    res.redirect(`/club/${req.session.user.id}`);
  }
);
// ===== Update Profile =====
app.post(
  "/updateProfile",
  requireLogin,
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "cv", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await User.findByPk(req.session.user.id);
      if (!user) return res.redirect("/login");

      // Common file validations
      const picFile = req.files["profilePic"]?.[0];
      if (picFile) {
        const allowedImage = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ]; // allow common image types
        if (!allowedImage.includes(picFile.mimetype))
          return res
            .status(400)
            .send("Invalid image type. Allowed: JPG, PNG, WEBP, GIF");
        if (picFile.size > 2 * 1024 * 1024)
          return res.status(400).send("Image too large (max 2MB)");
      }
      const cvFile = req.files["cv"]?.[0];
      if (cvFile) {
        const allowedDocs = [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (!allowedDocs.includes(cvFile.mimetype))
          return res
            .status(400)
            .send("Invalid CV file type. Upload PDF or Word document");
      }

      if (user.role === "student") {
        const { fullName, bio, phone, linkedin } = req.body;

        // normalize existing stored paths to web paths under /uploads
        let existingPic = user.profile_data && user.profile_data.profilePic;
        if (existingPic && !existingPic.startsWith("/uploads/")) {
          const parts = existingPic.replace(/\\/g, "/").split("/uploads/");
          if (parts.length > 1) existingPic = "/uploads/" + parts[1];
        }
        let existingCv = user.profile_data && user.profile_data.cv;
        if (existingCv && !existingCv.startsWith("/uploads/")) {
          const parts = existingCv.replace(/\\/g, "/").split("/uploads/");
          if (parts.length > 1) existingCv = "/uploads/" + parts[1];
        }

        const profilePic = picFile
          ? "/uploads/" + picFile.filename
          : existingPic;
        const cv = cvFile ? "/uploads/" + cvFile.filename : existingCv;

        const safeFullName = (fullName && fullName.trim()) || user.username; // avoid null username

        user.profile_data = {
          ...(user.profile_data || {}),
          fullName: safeFullName,
          bio,
          phone,
          linkedin,
          profilePic,
          cv,
        };

        user.username = safeFullName;
      } else if (user.role === "club") {
        const {
          clubName,
          clubDescription,
          representativeName,
          email,
          phone,
          linkedin,
          instagram,
          tiktok,
          x,
        } = req.body;

        // normalize existing stored path
        let existingPic = user.profile_data && user.profile_data.profilePic;
        if (existingPic && !existingPic.startsWith("/uploads/")) {
          const parts = existingPic.replace(/\\/g, "/").split("/uploads/");
          if (parts.length > 1) existingPic = "/uploads/" + parts[1];
        }

        const profilePic = picFile
          ? "/uploads/" + picFile.filename
          : existingPic;

        const safeClubName = (clubName && clubName.trim()) || user.username; // avoid null username

        user.profile_data = {
          ...(user.profile_data || {}),
          clubName: safeClubName,
          clubDescription,
          representativeName,
          email,
          phone,
          linkedin,
          instagram,
          tiktok,
          x,
          profilePic,
        };

        user.username = safeClubName;
      }

      await user.save();

      req.session.user = {
        ...req.session.user,
        username: user.username,
        profile_data: user.profile_data,
      };

      res.redirect(
        user.role === "student" ? `/student/${user.id}` : `/club/${user.id}`
      );
    } catch (err) {
      console.error(err);
      res.send("Something went wrong!");
    }
  }
);

// ===== Admin Profile =====
app.get("/admin/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "admin")
    return res.status(404).send("Admin not found");

  const studentCount = await User.count({ where: { role: "student" } });
  const clubCount = await User.count({ where: { role: "club" } });
  const postsCount = await Post.count();
  const recentLogs = await AuditLog.findAll({
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  res.render("adminProfile", {
    user,
    stats: {
      students: studentCount,
      clubs: clubCount,
      posts: postsCount,
    },
    recentLogs,
  });
});

// Show application form
app.get("/student/:studentId/apply/:clubId", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "student" ||
    req.session.user.id != req.params.studentId
  )
    return res.status(403).send("Forbidden");

  const club = await User.findByPk(req.params.clubId);
  if (!club || club.role !== "club")
    return res.status(404).send("Club not found");

  res.render("applicationForm", { club, error: null });
});

// Submit application
app.post(
  "/student/:studentId/apply/:clubId",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "student" ||
      req.session.user.id != req.params.studentId
    )
      return res.status(403).send("Forbidden");

    const club = await User.findByPk(req.params.clubId);
    if (!club || club.role !== "club")
      return res.status(404).send("Club not found");

    const { message } = req.body;

    await Application.create({
      studentId: req.session.user.id,
      clubId: club.id,
      message,
      status: "pending",
    });

    res.send("Your application has been submitted!"); // or redirect to student home
  }
);

// club view applications
app.get("/club/:clubId/applications", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "club" ||
    req.session.user.id != req.params.clubId
  )
    return res.status(403).send("Forbidden");

  const applications = await Application.findAll({
    where: { clubId: req.params.clubId, status: "pending" },
    include: [
      { model: User, as: "student", attributes: ["id", "username", "email"] },
    ],
  });

  res.render("clubApplications", { applications });
});

//club approve or reject
app.post(
  "/club/:clubId/applications/:appId/approve",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.clubId
    )
      return res.status(403).send("Forbidden");

    const app = await Application.findByPk(req.params.appId);
    if (!app) return res.status(404).send("Application not found");

    app.status = "approved";
    await app.save();

    res.redirect(`/club/${req.params.clubId}/applications`);
  }
);

app.post(
  "/club/:clubId/applications/:appId/reject",
  requireLogin,
  async (req, res) => {
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.clubId
    )
      return res.status(403).send("Forbidden");

    const app = await Application.findByPk(req.params.appId);
    if (!app) return res.status(404).send("Application not found");

    app.status = "rejected";
    app.clubNotes = req.body.clubNotes || "";
    await app.save();

    res.redirect(`/club/${req.params.clubId}/applications`);
  }
);

// ===== Start Server =====
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected!");
    await sequelize.sync({ force: true });
    console.log("All models synced!");

    // Seed default admin
    const adminEmail = process.env.ADMIN_EMAIL;
    let admin = await User.findOne({ where: { email: adminEmail } });

    if (!admin) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASS, 10);
      admin = await User.create({
        username: "Super Admin",
        email: adminEmail,
        password: hashedPassword,
        verificationToken: crypto.randomBytes(20).toString("hex"),
        role: "admin",
        isVerified: true,
        profile_data: { fullName: "Super Admin" },
      });
      console.log("Default admin created!");
    }

    app.listen(3000, () =>
      console.log("Server running at http://localhost:3000")
    );
  } catch (err) {
    console.error("Database connection error:", err);
  }
})();
