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
const { Message } = require("./models/message");
const { Op } = require("sequelize");

// ===== Model Associations =====
// Event → Club(User)
try {
  Event.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn("Association setup warning (Event→User):", e?.message || e);
}

// EventReport → Event
try {
  EventReport.belongsTo(Event, { as: "event", foreignKey: "eventId" });
  Event.hasOne(EventReport, { as: "report", foreignKey: "eventId" });
} catch (e) {
  console.warn(
    "Association setup warning (EventReport→Event):",
    e?.message || e
  );
}

// EventReport → Club(User)
try {
  EventReport.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn(
    "Association setup warning (EventReport→User):",
    e?.message || e
  );
}

// Application → Student(User) and Club(User)
try {
  Application.belongsTo(User, { as: "student", foreignKey: "studentId" });
  Application.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn(
    "Association setup warning (Application→User):",
    e?.message || e
  );
}

// Post → Club(User)
try {
  Post.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn("Association setup warning (Post→User):", e?.message || e);
}

// Subscription associations
try {
  Subscription.belongsTo(User, { as: "student", foreignKey: "studentId" });
  Subscription.belongsTo(User, { as: "club", foreignKey: "clubId" });
} catch (e) {
  console.warn(
    "Association setup warning (Subscription→User):",
    e?.message || e
  );
}

// Message associations
try {
  Message.belongsTo(User, { as: "sender", foreignKey: "senderId" });
  Message.belongsTo(User, {
    as: "receiver",
    foreignKey: "receiverId",
    allowNull: true,
  });
} catch (e) {
  console.warn("Association setup warning (Message→User):", e?.message || e);
}
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRSVPEmail,
  sendNotificationEmail,
} = require("./config/mailer");
const { AuditLog } = require("./models/auditLog");
const crypto = require("crypto");
require("dotenv").config();
const app = express();
const http = require("http");
const socketio = require("socket.io");

// ===== Middleware =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Session & Middleware Inits =====
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

// Flash middleware makes req.session.flash available as one-time variables and exposes them to res.locals
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || {};
  // clear the flash for next render
  req.session.flash = {};
  next();
});

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

// Utility for setting req.session.flash
function setFlash(req, type, message) {
  req.session.flash = req.session.flash || {};
  req.session.flash[type] = message;
}

// Time ago helper
function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
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
      return res.redirect(`/admin/dashboard`);
    else if (req.session.user.role === "dean")
      return res.redirect(`/dean/dashboard`);
  }
  res.redirect("/landing");
});

// ===== Landing =====
app.get("/landing", (req, res) => res.render("landing"));

// ===== Signup =====
app.get("/signup", (req, res) =>
  res.render("signup", { error: null, message: null })
);

app.post("/signup", upload.single("clubLogo"), async (req, res) => {
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

      if (!email) {
        setFlash(req, "error", "Invalid email!");
        return res.redirect("/signup");
      }

      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
      if (!passwordOk) {
        setFlash(
          req,
          "error",
          "Password must be at least 8 characters and include letters and numbers."
        );
        return res.redirect("/signup");
      }

      // length covered by regex above; keep confirm check below
      if (password !== confirmPassword) {
        setFlash(req, "error", "Passwords do not match!");
        return res.redirect("/signup");
      }

      // ensure email is unique
      const existingByEmail = await User.findOne({ where: { email } });
      if (existingByEmail) {
        setFlash(req, "error", "Email already exists!");
        return res.redirect("/signup");
      }

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
      setFlash(
        req,
        "message",
        "A verification email has been sent to your email address. Please verify your email to login."
      );
      return res.redirect("/signup");
    } else if (role === "club") {
      // === Club signup → save as ClubRequest instead of User ===
      const {
        clubName,
        clubKind,
        clubStatus,
        clubDescription,
        representativeName,
        clubVision,
        clubActivities,
        presidentName,
        presidentStudentID,
        presidentPhone,
        presidentCollege,
        vpName,
        vpStudentID,
        vpPhone,
        member1,
        member2,
        member3,
        member4,
        member5,
        advisorName,
        advisorEmail,
        advisorSignature,
        clubEmail,
        clubSocials,
        clubMembersCount,
        clubFair,
        deanName,
        deanSignature,
        deanApprovalDate,
        dsaName,
        dsaSignature,
        dsaApprovalDate,
        clubPassword,
        clubConfirmPassword,
      } = req.body;
      email = clubEmail.trim().toLowerCase();
      username = clubName.trim();
      password = clubPassword;
      confirmPassword = clubConfirmPassword;

      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
      if (!passwordOk) {
        setFlash(
          req,
          "error",
          "Password must be at least 8 characters and include letters and numbers."
        );
        return res.redirect("/signup");
      }
      if (password !== confirmPassword) {
        setFlash(req, "error", "Passwords do not match!");
        return res.redirect("/signup");
      }

      // uniqueness: email and club name
      const existingClubEmail = await User.findOne({ where: { email } });
      if (existingClubEmail) {
        setFlash(req, "error", "Email already exists!");
        return res.redirect("/signup");
      }
      const existingPendingReqEmail = await ClubRequest.findOne({
        where: { clubEmail: email, status: "pending" },
      });
      if (existingPendingReqEmail) {
        setFlash(
          req,
          "error",
          "A pending request with this email already exists."
        );
        return res.redirect("/signup");
      }

      // unique club name among existing clubs and pending requests
      const normalizedClubName = username.trim();
      const existingClubName = await User.findOne({
        where: { username: normalizedClubName, role: "club" },
      });
      if (existingClubName) {
        setFlash(req, "error", "Club name already taken.");
        return res.redirect("/signup");
      }
      const existingPendingClubName = await ClubRequest.findOne({
        where: { clubName: normalizedClubName, status: "pending" },
      });
      if (existingPendingClubName) {
        setFlash(
          req,
          "error",
          "A pending request with this club name already exists."
        );
        return res.redirect("/signup");
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(20).toString("hex");

      // Handle file upload for clubLogo
      let clubLogoPath = null;
      if (req.file) {
        clubLogoPath = "/uploads/" + req.file.filename;
      }

      await ClubRequest.create({
        clubName: username,
        clubEmail: email,
        passwordHash: hashedPassword,
        clubKind,
        clubStatus,
        clubDescription,
        representativeName,
        clubVision,
        clubActivities,
        presidentName,
        presidentStudentID,
        presidentPhone,
        presidentCollege,
        vpName,
        vpStudentID,
        vpPhone,
        member1,
        member2,
        member3,
        member4,
        member5,
        advisorName,
        advisorEmail,
        advisorSignature,
        clubSocials,
        clubMembersCount,
        clubFair,
        clubLogo: clubLogoPath,
        deanName,
        deanSignature,
        dsaName,
        dsaSignature,
        status: 'pending',
        isVerified: false,
        verificationToken: verificationToken
      });

      await sendVerificationEmail(email, verificationToken);
      setFlash(
        req,
        "message",
        "A verification email has been sent to your email address. Please verify your email and then wait for admin approval."
      );
      return res.redirect("/signup");
    } else {
      setFlash(req, "error", "Please select a role");
      return res.redirect("/signup");
    }
  } catch (err) {
    console.error("Club signup error:", err);
    setFlash(req, "error", "Something went wrong!");
    return res.redirect("/signup");
  }
});

// ===== Email Verification =====
app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token)
    return res.render("login", { error: "Invalid verification link." });

  try {
    const user = await User.findOne({ where: { verificationToken: token } });
    if (user) {
      user.isVerified = true;
      user.verificationToken = null;
      await user.save();

      res.render("login", {
        error: null,
        message: "Email verified successfully. You can now login.",
      });
    } else {
      const clubRequest = await ClubRequest.findOne({ where: { verificationToken: token } });
      if (clubRequest) {
        clubRequest.isVerified = true;
        clubRequest.verificationToken = null;
        await clubRequest.save();

        res.render("login", {
          error: null,
          message: "Email verified successfully. Please wait for admin approval.",
        });
      } else {
        res.render("login", { error: "Invalid verification link." });
      }
    }
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
    if (!user) {
      setFlash(req, "error", "User not found!");
      return res.redirect("/login");
    }

    if (!user.isVerified) {
      setFlash(req, "error", "Please verify your email before logging in.");
      return res.redirect("/login");
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      setFlash(req, "error", "Invalid credentials!");
      return res.redirect("/login");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile_data: user.profile_data,
    };
    setFlash(req, "message", "Logged in successfully!");
    if (user.role === "student")
      return res.redirect(`/student/${user.id}/home`);
    else if (user.role === "club") return res.redirect(`/club/${user.id}`);
    else if (user.role === "admin") return res.redirect(`/admin/dashboard`);
    else if (user.role === "dean") return res.redirect(`/dean/dashboard`);
  } catch (err) {
    console.error(err);
    setFlash(req, "error", "Something went wrong!");
    return res.redirect("/login");
  }
});

// ===== Password Reset =====
app.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, message: null });
});

app.post("/forgot-password", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ where: { email } });
  const token = crypto.randomBytes(20).toString("hex");
  if (user) {
    user.resetToken = token;
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(user.email, token);
  }
  setFlash(
    req,
    "message",
    "Password reset link sent! Please check your email."
  );
  res.redirect("/forgot-password");
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
  res.render("reset-password", {
    token,
    error: null,
    message: null,
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
    where: { status: ["pending", "admin_approved"], isVerified: true },
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
    if (creq.clubKind === "Academic") {
      creq.status = "admin_approved";
      creq.approvedByAdmin = true;
      creq.adminApprovalDate = new Date();
      await creq.save();
    } else {
      // Non-academic clubs are approved directly by admin
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
            isVerified: true,
            profile_data: {
              clubKind: creq.clubKind,
              clubDescription: creq.clubDescription,
              representativeName: creq.representativeName,
            },
          },
          { transaction: t }
        );
        creq.status = "approved";
        creq.approvedByAdmin = true;
        creq.adminApprovalDate = new Date();
        await creq.save({ transaction: t });
      });
    }
    res.redirect("/admin/club-requests");
  } catch (err) {
    console.error("Admin approve club request failed:", err);
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

// Admin view single club request detail
app.get("/admin/club-requests/:id", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const clubRequest = await ClubRequest.findByPk(req.params.id);
  if (!clubRequest) return res.status(404).send("Club request not found");
  res.render("admin-club-request-detail", { clubRequest, viewerRole: "admin" });
});

// Dean view single club request detail
app.get("/dean/club-requests/:id", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
    return res.status(403).send("Forbidden");
  const clubRequest = await ClubRequest.findByPk(req.params.id);
  if (!clubRequest) return res.status(404).send("Club request not found");
  res.render("admin-club-request-detail", { clubRequest, viewerRole: "dean" });
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

  // Send notifications to subscribed students
  const subscriptions = await Subscription.findAll({
    where: { clubId: post.clubId },
    include: [{ model: User, as: "student", attributes: ["email"] }],
  });
  const subscribedEmails = subscriptions.map((s) => s.student.email);

  const club = await User.findByPk(post.clubId, { attributes: ["username"] });

  for (const email of subscribedEmails) {
    try {
      await sendNotificationEmail(
        email,
        club.username,
        "post",
        null, // no title for posts
        post.text
      );
    } catch (error) {
      console.error(`Failed to send post notification to ${email}:`, error);
    }
  }

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

  const subscriptions = await Subscription.findAll({
    where: { studentId: user.id },
  });
  const subscribedClubIds = subscriptions.map((s) => s.clubId);
  const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));

  const formatPosts = (posts) => {
    return posts.map((post) => {
      const postJSON = post.toJSON();
      return {
        ...postJSON,
        clubName: postJSON.club?.username,
        clubProfilePic: postJSON.club?.profile_data?.profilePic,
        timeAgo: timeSince(new Date(postJSON.createdAt)),
      };
    });
  };

  const allPostsRaw = await Post.findAll({
    where: {
      status: "approved",
      createdAt: {
        [Op.gte]: thirtyDaysAgo,
      },
    },
    include: [
      { model: User, as: "club", attributes: ["username", "profile_data"] },
    ],
    order: [["createdAt", "DESC"]],
  });
  const allPosts = formatPosts(allPostsRaw);

  const subPostsRaw = subscribedClubIds.length
    ? await Post.findAll({
        where: {
          status: "approved",
          clubId: subscribedClubIds,
          createdAt: {
            [Op.gte]: thirtyDaysAgo,
          },
        },
        include: [
          { model: User, as: "club", attributes: ["username", "profile_data"] },
        ],
        order: [["createdAt", "DESC"]],
      })
    : [];
  const subPosts = formatPosts(subPostsRaw);

  const upcomingSubscribedEvents = subscribedClubIds.length
    ? await Event.findAll({
        where: {
          status: "approved",
          clubId: subscribedClubIds,
          startsAt: {
            [Op.gte]: new Date(),
          },
        },
        order: [["startsAt", "ASC"]],
      })
    : [];

  const allUpcomingEvents = await Event.findAll({
    where: {
      status: "approved",
      startsAt: {
        [Op.gte]: new Date(),
      },
    },
    include: [
      { model: User, as: "club", attributes: ["username", "profile_data"] },
    ],
    order: [["startsAt", "ASC"]],
  });

  res.render("homepage", {
    user,
    allPosts,
    subPosts,
    upcomingSubscribedEvents,
    allUpcomingEvents,
  });
});

// ===== API Routes =====
app.get("/api/subscriptions/club/:clubId", function (req, res) {
  return requireLogin(async function (req, res) {
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.clubId
    )
      return res.status(403).json({ error: "Forbidden" });

    try {
      const subscriptions = await Subscription.findAll({
        where: { clubId: req.params.clubId },
        include: [
          {
            model: User,
            as: "student",
            attributes: ["id", "username", "profile_data"],
          },
        ],
      });
      res.json(subscriptions);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  })(req, res);
});

// ===== Student Messages =====
app.get("/student/:id/messages", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "student" ||
    req.session.user.id != req.params.id
  )
    return res.status(403).send("Forbidden");

  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "student")
    return res.status(404).send("Student not found");

  res.render("studentMessages", { user });
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

  // Check for events that need reports (completed events without reports)
  const completedEventsWithoutReports = await Event.findAll({
    where: {
      clubId: user.id,
      status: "approved",
      endsAt: {
        [require("sequelize").Op.lt]: new Date(),
      },
    },
    include: [
      {
        model: EventReport,
        required: false,
        as: "report",
      },
    ],
  });

  // Filter events that don't have reports
  const eventsNeedingReports = completedEventsWithoutReports.filter(
    (event) => !event.report
  );

  res.render("clubProfile", {
    user,
    posts,
    events,
    eventsNeedingReports,
    pendingReportsCount: eventsNeedingReports.length,
  });
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

  // Get applications for this student
  const applications = await Application.findAll({
    where: {
      studentId: user.id,
      status: {
        [Op.or]: ["pending", "accepted"],
      },
    },
  });

  const applicationMap = new Map();
  applications.forEach((app) => {
    applicationMap.set(app.clubId, {
      status: app.status,
      hasApplied: true,
      isAccepted: app.status === "accepted",
      isPending: app.status === "pending",
    });
  });

  // Get subscriptions for this student
  const subscriptions = await Subscription.findAll({
    where: { studentId: user.id },
  });

  const subscriptionMap = new Map();
  subscriptions.forEach((sub) => {
    subscriptionMap.set(sub.clubId, true);
  });

  const filtered = clubs.filter(
    (c) =>
      !q ||
      c.username.toLowerCase().includes(q) ||
      (c.profile_data?.clubDescription || "").toLowerCase().includes(q)
  );

  const decorated = filtered.map((c) => {
    const appInfo = applicationMap.get(c.id) || {
      hasApplied: false,
      isAccepted: false,
      isPending: false,
    };
    const isSubscribed = subscriptionMap.get(c.id) || false;
    return {
      ...c.toJSON(),
      ...appInfo,
      isSubscribed,
    };
  });

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

// Club: show event creation form
app.get("/club/:id/event/new", requireLogin, async (req, res) => {
  if (req.session.user.role !== "club" || req.session.user.id != req.params.id)
    return res.status(403).send("Forbidden");

  const club = await User.findByPk(req.params.id);
  if (!club) return res.status(404).send("Club not found");

  // Check if there are any completed events without reports
  const completedEventsWithoutReports = await Event.findAll({
    where: {
      clubId: club.id,
      status: "approved",
      endsAt: {
        [require("sequelize").Op.lt]: new Date(), // Events that have ended
      },
    },
    include: [
      {
        model: EventReport,
        required: false,
        as: "report",
      },
    ],
  });

  // Filter events that don't have reports
  const eventsNeedingReports = completedEventsWithoutReports.filter(
    (event) => !event.report
  );

  if (eventsNeedingReports.length > 0) {
    setFlash(
      req,
      "error",
      `You must submit reports for ${eventsNeedingReports.length} completed event(s) before creating a new event. Please complete the pending reports first.`
    );
    return res.redirect(`/club/${club.id}`);
  }

  res.render("eventForm", {
    // file is now eventForm.ejs
    clubId: club.id,
    clubName: club.username,
    error: req.session.flash?.error || null,

    // these are the names used inside the value="..." attributes
    advisorName: "",
    advisorSignature: "",
    advisorComments: "",
    deanName: "",
    deanSignature: "",
    deanComments: "",
    dsaName: "",
    dsaSignature: "",
    dsaComments: "",
  });
});
// Club: create event form

app.post(
  "/club/:id/event/new",
  requireLogin,
  // === MULTER MIDDLEWARE FOR FILE UPLOADS ===
  upload.fields([
    { name: "reservationConfirmation", maxCount: 1 }, // Matches input name="reservationConfirmation"
    { name: "eventProposalBudget", maxCount: 5 }, // Matches input name="eventProposalBudget"
    { name: "speakerCV", maxCount: 1 }, // Matches input name="speakerCV"
  ]),
  async (req, res) => {
    // 1. Authorization check
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.id
    ) {
      setFlash(req, "error", "Unauthorized access.");
      return res.status(403).redirect(`/club/${req.params.id}`);
    }

    // 2. Check for pending reports before allowing new event creation
    const completedEventsWithoutReports = await Event.findAll({
      where: {
        clubId: req.session.user.id,
        status: "approved",
        endsAt: {
          [require("sequelize").Op.lt]: new Date(), // Events that have ended
        },
      },
      include: [
        {
          model: EventReport,
          required: false,
          as: "report",
        },
      ],
    });

    const eventsNeedingReports = completedEventsWithoutReports.filter(
      (event) => !event.report
    );
    if (eventsNeedingReports.length > 0) {
      setFlash(
        req,
        "error",
        `You must submit reports for ${eventsNeedingReports.length} completed event(s) before creating a new event. Please complete the pending reports first.`
      );
      return res.redirect(`/club/${req.session.user.id}`);
    }

    try {
      // 2. Destructure fields from req.body (parsed by multer for multipart/form-data)
      //    Ensure these names EXACTLY match the `name` attributes in your `eventForm.ejs`
      const {
        activityName,
        activityType,
        activityTypeOther,
        startDate,
        startTime,
        endDate,
        endTime,
        activityLocation,
        activityLocationOther,
        locationReserved, // radio button value 'Yes' or 'No'
        activityGoals, // Array from multiple text inputs
        targetAudience,
        expectedAttendees,
        activityRequests, // Array from multiple text inputs
        hasSpeaker, // radio button value 'Yes' or 'No'
        speakerType, // radio button value 'PSU Members' or 'Outside PSU'
        speakerNamePosition,
        officeCenterName,
        representativeName, // This is for collaboration rep, not club's main rep
        roleType,
        requiredTasks, // Array from multiple text inputs
        memberName, // Array from the dynamic table
        memberID, // Array from the dynamic table
        memberMobile, // Array from the dynamic table
        // These approval fields are usually updated by admin/advisor later,
        // but if you want to store what was submitted in the form:
        advisorName,
        advisorSignature,
        advisorComments,
        deanName, // For academic clubs
        deanSignature,
        deanComments,
        dsaName,
        dsaSignature,
        dsaComments,
      } = req.body;

      // 3. Process Uploaded Files (from req.files)
      const files = req.files;
      const reservationConfirmationPath =
        files["reservationConfirmation"] && files["reservationConfirmation"][0]
          ? "/uploads/" + files["reservationConfirmation"][0].filename
          : null;

      const eventProposalBudgetPaths = files["eventProposalBudget"]
        ? files["eventProposalBudget"].map(
            (file) => "/uploads/" + file.filename
          )
        : [];

      const speakerCVPath =
        files["speakerCV"] && files["speakerCV"][0]
          ? "/uploads/" + files["speakerCV"][0].filename
          : null;

      // 4. Combine/Process Data
      const finalActivityType =
        activityType === "Other" ? activityTypeOther : activityType;
      const finalActivityLocation =
        activityLocation === "OtherLocation"
          ? activityLocationOther
          : activityLocation;

      const startsAtDateTime =
        startDate && startTime ? new Date(`${startDate}T${startTime}`) : null;

      const endsAtDateTime =
        endDate && endTime ? new Date(`${endDate}T${endTime}`) : null;

      // Prepare responsible members data (array of objects)
      const responsibleMembers =
        memberName && memberID && memberMobile
          ? memberName.map((name, index) => ({
              name: name,
              id: memberID[index],
              mobile: memberMobile[index],
            }))
          : [];

      // Combine description from various fields (if you still want a single description field)
      const combinedDescription = `
        **Activity Type:** ${finalActivityType}
        **Target Audience:** ${targetAudience}
        **Expected Attendees:** ${expectedAttendees}

        **Goals:**
        ${
          Array.isArray(activityGoals) &&
          activityGoals.some((g) => g.trim() !== "")
            ? activityGoals
                .filter((g) => g.trim() !== "")
                .map((g, i) => `  - ${g}`)
                .join("\n")
            : "  - None specified"
        }

        **Requests:**
        ${
          Array.isArray(activityRequests) &&
          activityRequests.some((r) => r.trim() !== "")
            ? activityRequests
                .filter((r) => r.trim() !== "")
                .map((r, i) => `  - ${r}`)
                .join("\n")
            : "  - None specified"
        }

        ${
          officeCenterName
            ? `**Organizing with:** ${officeCenterName} (Representative: ${representativeName}, Role: ${roleType})
           **Required Tasks:**
           ${
             Array.isArray(requiredTasks) &&
             requiredTasks.some((t) => t.trim() !== "")
               ? requiredTasks
                   .filter((t) => t.trim() !== "")
                   .map((t, i) => `  - ${t}`)
                   .join("\n")
               : "  - None specified"
           }`
            : ""
        }
      `.trim();

      // 5. Create the Event in the database
      await Event.create({
        clubId: req.session.user.id,
        title: activityName,
        description: combinedDescription,
        location: finalActivityLocation,
        startsAt: startsAtDateTime,
        endsAt: endsAtDateTime,
        capacity: expectedAttendees ? parseInt(expectedAttendees) : null,
        status: "pending",
        activityType: finalActivityType,
        targetAudience: targetAudience,
        expectedAttendees: expectedAttendees
          ? parseInt(expectedAttendees)
          : null,
        reservationConfirmationFile: reservationConfirmationPath,
        eventProposalBudgetFiles: eventProposalBudgetPaths,
        hasSpeaker: hasSpeaker === "Yes",
        speakerType: hasSpeaker === "Yes" ? speakerType : null,
        speakerNamePosition: hasSpeaker === "Yes" ? speakerNamePosition : null,
        speakerCVFile: speakerCVPath,
        officeCenterName: officeCenterName || null,
        representativeNameOffice: representativeName || null,
        roleType: roleType || null,
        requiredTasks:
          Array.isArray(requiredTasks) &&
          requiredTasks.some((t) => t.trim() !== "")
            ? requiredTasks.filter((t) => t.trim() !== "")
            : [],
        responsibleMembers: responsibleMembers,
        // clubAdvisorNameSubmitted: advisorName,
        // clubAdvisorSignatureSubmitted: advisorSignature,
        // clubAdvisorCommentsSubmitted: advisorComments,
        // collegeDeanNameSubmitted: deanName,
        // collegeDeanSignatureSubmitted: deanSignature,
        // collegeDeanCommentsSubmitted: deanComments,
        // dsaNameSubmitted: dsaName,
        // dsaSignatureSubmitted: dsaSignature,
        // dsaCommentsSubmitted: dsaComments,
      });

      setFlash(
        req,
        "message",
        "Event request submitted successfully and is awaiting approval!"
      );
      res.redirect(`/club/${req.session.user.id}`);
    } catch (err) {
      console.error("Error creating event:", err);
      setFlash(
        req,
        "error",
        "Failed to submit event request. Please try again."
      );
      // You might want to pass existing form data back to the template if you re-render on error
      // For now, redirecting to the club profile on error.
      res.redirect(`/club/${req.session.user.id}`);
    }
  }
);

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

  const event = await Event.findByPk(req.params.eventId, {
    include: [
      {
        model: User,
        as: "club",
        attributes: ["id", "username", "profile_data"],
      },
    ],
  });
  if (!event) return res.status(404).send("Event not found");

  const clubKind = event.club?.profile_data?.clubKind || "Academic"; // Default to academic if not set

  event.approvedByAdmin = true;
  event.adminApprovalDate = new Date();

  if (clubKind === "Non Academic") {
    event.status = "approved";
    event.approvedByDean = true; // Override, no dean needed

    // Send notifications to subscribed students
    const subscriptions = await Subscription.findAll({
      where: { clubId: event.clubId },
      include: [{ model: User, as: "student", attributes: ["email"] }],
    });
    const subscribedEmails = subscriptions.map((s) => s.student.email);

    const club = await User.findByPk(event.clubId, {
      attributes: ["username"],
    });

    const eventDescription = `Location: ${event.location || "TBA"}\nStarts: ${
      event.startsAt ? new Date(event.startsAt).toLocaleString() : "TBA"
    }\nEnds: ${
      event.endsAt ? new Date(event.endsAt).toLocaleString() : "TBA"
    }\nCapacity: ${event.capacity || "Unlimited"}\n\n${
      event.description || ""
    }`;

    for (const email of subscribedEmails) {
      try {
        await sendNotificationEmail(
          email,
          club.username,
          "event",
          event.title,
          eventDescription
        );
      } catch (error) {
        console.error(`Failed to send event notification to ${email}:`, error);
      }
    }
  } else {
    // Academic: status remains 'pending' until dean approves
    // No notifications yet
  }

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
  res.render("eventReportForm", {
    event,
    error: req.session.flash?.error || null,
    message: req.session.flash?.message || null,
  });
});

// submit report
app.post(
  "/club/:id/event/:eventId/report",
  requireLogin,
  upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "attendanceSheet", maxCount: 5 },
    { name: "receiptsAndLiquidation", maxCount: 5 },
    { name: "activityProposal", maxCount: 5 },
    { name: "supportingDocuments", maxCount: 10 },
  ]),
  async (req, res) => {
    if (
      req.session.user.role !== "club" ||
      req.session.user.id != req.params.id
    )
      return res.status(403).send("Forbidden");

    try {
      const {
        clubName,
        facultyAdviserName,
        activityTitle,
        activityDate,
        activityLocation,
        purposeOfActivity,
        activityDescription,
        managingStudents,
        participatingStudents,
        numberOfAttendance,
        evaluationResults,
        recommendations,
      } = req.body;

      // Process uploaded files
      const files = req.files;
      const photos = files["photos"]
        ? files["photos"].map((f) => "/uploads/" + f.filename)
        : [];
      const attendanceSheet = files["attendanceSheet"]
        ? files["attendanceSheet"].map((f) => "/uploads/" + f.filename)
        : [];
      const receiptsAndLiquidation = files["receiptsAndLiquidation"]
        ? files["receiptsAndLiquidation"].map((f) => "/uploads/" + f.filename)
        : [];
      const activityProposal = files["activityProposal"]
        ? files["activityProposal"].map((f) => "/uploads/" + f.filename)
        : [];
      const supportingDocuments = files["supportingDocuments"]
        ? files["supportingDocuments"].map((f) => "/uploads/" + f.filename)
        : [];

      // Create the report
      await EventReport.create({
        eventId: req.params.eventId,
        clubId: req.session.user.id,
        clubName,
        facultyAdviserName,
        activityTitle,
        activityDate: new Date(activityDate),
        activityLocation,
        purposeOfActivity,
        activityDescription,
        managingStudents,
        participatingStudents,
        numberOfAttendance: parseInt(numberOfAttendance) || 0,
        evaluationResults,
        recommendations,
        photos,
        attendanceSheet,
        receiptsAndLiquidation,
        activityProposal,
        supportingDocuments,
        // Legacy fields for backward compatibility
        summary: activityDescription,
        attendeesCount: parseInt(numberOfAttendance) || 0,
        attachments: [
          ...photos,
          ...attendanceSheet,
          ...receiptsAndLiquidation,
          ...activityProposal,
          ...supportingDocuments,
        ],
      });

      setFlash(req, "message", "Event report submitted successfully!");
      res.redirect(`/club/${req.session.user.id}`);
    } catch (err) {
      console.error("Error submitting report:", err);
      setFlash(req, "error", "Failed to submit report. Please try again.");
      res.redirect(`/club/${req.params.id}/event/${req.params.eventId}/report`);
    }
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

      if (user.role === "student" || user.role === "admin") {
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
      if (user.role === "student") {
        res.redirect(`/student/${user.id}`);
      } else if (user.role === "club") {
        res.redirect(`/club/${user.id}`);
      } else {
        res.redirect(`/admin/dashboard`);
      }
    } catch (err) {
      console.error(err);
      res.send("Something went wrong!");
    }
  }
);

// ===== Dean Profile =====
app.get("/dean/dashboard", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.session.user.id);
  if (!user || user.role !== "dean")
    return res.status(404).send("Dean not found");

  const studentCount = await User.count({ where: { role: "student" } });
  const clubCount = await User.count({ where: { role: "club" } });
  const postsCount = await Post.count();
  const recentLogs = await AuditLog.findAll({
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  const allEvents = await Event.findAll({
    include: [
      { model: User, as: "club", attributes: ["username", "profile_data"] },
    ],
    order: [["startsAt", "ASC"]],
  });

  res.render("deanProfile", {
    user,
    stats: {
      students: studentCount,
      clubs: clubCount,
      posts: postsCount,
    },
    recentLogs,
    allEvents,
  });
});

// Dean club requests
app.get("/dean/club-requests", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean") {
    console.log(req.session.user.role);
    return res.status(403).send("Forbidden");
  }
  const requests = await ClubRequest.findAll({
    where: { status: "admin_approved", isVerified: true },
    order: [["createdAt", "ASC"]],
  });
  console.log(
    `Dean club requests: found ${requests.length} admin_approved clubs`
  );
  requests.forEach((r) =>
    console.log(
      `  Club: ${r.clubName}, status: ${r.status}, clubKind: ${r.clubKind}`
    )
  );
  res.render("dean-club-requests", { requests });
});

// Dean approve club
app.post("/dean/club-requests/:id/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
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
          isVerified: true, // Clubs are verified by admin/dean approval
          profile_data: {
            clubDescription: creq.clubDescription,
            representativeName: creq.representativeName,
          },
        },
        { transaction: t }
      );

      creq.deanApprovalDate = new Date();
      creq.status = "approved";
      await creq.save({ transaction: t });
    });

    res.redirect("/dean/club-requests");
  } catch (err) {
    console.error("Approve club request failed:", err);
    return res.status(500).send("Failed to approve club request.");
  }
});

// Dean reject club
app.post("/dean/club-requests/:id/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
    return res.status(403).send("Forbidden");
  const reqId = req.params.id;
  const creq = await ClubRequest.findByPk(reqId);
  if (!creq) return res.status(404).send("Not found");
  creq.status = "rejected";
  creq.deanNotes = req.body.deanNotes || "";
  await creq.save();
  res.redirect("/dean/club-requests");
});

// Dean view pending events (only academic clubs)
app.get("/dean/events", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
    return res.status(403).send("Forbidden");

  const allPendingEvents = await Event.findAll({
    where: { status: "pending", approvedByAdmin: true, approvedByDean: false },
    include: [
      {
        model: User,
        as: "club",
        attributes: ["id", "username", "email", "profile_data"],
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  // Filter only academic clubs
  const pendingEvents = allPendingEvents.filter(
    (event) => event.club?.profile_data?.clubKind === "Academic"
  );
  res.render("DeanEvents", { pendingEvents });
});

// Dean approve event
app.post("/dean/events/:eventId/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
    return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");
  if (!event.approvedByAdmin)
    return res.status(400).send("Admin approval required first");

  event.approvedByDean = true;
  event.deanApprovalDate = new Date();
  event.status = "approved";
  await event.save();

  // Send notifications to subscribed students
  const subscriptions = await Subscription.findAll({
    where: { clubId: event.clubId },
    include: [{ model: User, as: "student", attributes: ["email"] }],
  });
  const subscribedEmails = subscriptions.map((s) => s.student.email);

  const club = await User.findByPk(event.clubId, { attributes: ["username"] });

  const eventDescription = `Location: ${event.location || "TBA"}\nStarts: ${
    event.startsAt ? new Date(event.startsAt).toLocaleString() : "TBA"
  }\nEnds: ${
    event.endsAt ? new Date(event.endsAt).toLocaleString() : "TBA"
  }\nCapacity: ${event.capacity || "Unlimited"}\n\n${event.description || ""}`;

  for (const email of subscribedEmails) {
    try {
      await sendNotificationEmail(
        email,
        club.username,
        "event",
        event.title,
        eventDescription
      );
    } catch (error) {
      console.error(`Failed to send event notification to ${email}:`, error);
    }
  }

  res.redirect("/dean/events");
});

// Dean reject event
app.post("/dean/events/:eventId/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "dean")
    return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");

  event.approvedByDean = false;
  event.deanNotes = req.body.deanNotes || "";
  event.status = "rejected";
  event.deanApprovalDate = new Date();
  await event.save();

  res.redirect("/dean/events");
});

// ===== Admin Profile =====
app.get("/admin/dashboard", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.session.user.id);
  if (!user || user.role !== "admin")
    return res.status(404).send("Admin not found");

  const studentCount = await User.count({ where: { role: "student" } });
  const clubCount = await User.count({ where: { role: "club" } });
  const postsCount = await Post.count();
  const recentLogs = await AuditLog.findAll({
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  const allEvents = await Event.findAll({
    include: [
      { model: User, as: "club", attributes: ["username", "profile_data"] },
    ],
    order: [["startsAt", "ASC"]],
  });

  res.render("adminProfile", {
    user,
    stats: {
      students: studentCount,
      clubs: clubCount,
      posts: postsCount,
    },
    recentLogs,
    allEvents,
  });
});

// Admin Reports Page
app.get("/admin/reports", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).send("Forbidden");
  const reports = await EventReport.findAll({
    include: [
      { model: Event, as: "event" },
      { model: User, as: "club", attributes: ["id", "username", "email"] },
    ],
    order: [["createdAt", "DESC"]],
  });
  res.render("adminReports", { reports });
});

// Admin Profile Settings Page
app.get("/admin/settings", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.session.user.id);
  if (!user || user.role !== "admin")
    return res.status(404).send("Admin not found");
  res.render("adminProfileSettings", { user });
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
  "/student/:studentId/leave/:clubId",
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

    await Application.destroy({
      where: {
        studentId: req.session.user.id,
        clubId: club.id,
        status: "accepted",
      },
    });

    await Subscription.destroy({
      where: {
        studentId: req.session.user.id,
        clubId: club.id,
      },
    });

    setFlash(req, "message", `You have successfully left ${club.username}.`);
    res.redirect(`/student/${req.session.user.id}/clubs`);
  }
);

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

    const { studentName, gender, major, academicYear, skills, motivation } =
      req.body;

    // Check if student already applied to this club
    const existingApplication = await Application.findOne({
      where: {
        studentId: req.session.user.id,
        clubId: club.id,
      },
    });

    if (existingApplication) {
      if (
        existingApplication.status === "pending" ||
        existingApplication.status === "accepted"
      ) {
        setFlash(
          req,
          "error",
          "You have already applied to this club and your application is either pending or has been accepted."
        );
        return res.redirect(`/student/${req.session.user.id}/clubs`);
      }
      // If rejected, allow re-application by updating the existing record
      existingApplication.studentName = studentName;
      existingApplication.gender = gender;
      existingApplication.major = major;
      existingApplication.academicYear = academicYear;
      existingApplication.skills = skills;
      existingApplication.motivation = motivation;
      existingApplication.message = motivation;
      existingApplication.status = "pending"; // Reset status
      existingApplication.clubNotes = null; // Clear rejection notes
      await existingApplication.save();
    } else {
      // No existing application, create a new one
      const user = await User.findByPk(req.session.user.id);
      await Application.create({
        studentId: req.session.user.id,
        clubId: club.id,
        email: user.email, // Add student's email
        studentName,
        gender,
        major,
        academicYear,
        skills,
        motivation,
        message: motivation, // Keep legacy field for backward compatibility
        status: "pending",
      });
    }

    setFlash(
      req,
      "message",
      "Your application has been submitted successfully!"
    );
    res.redirect(`/student/${req.session.user.id}/clubs`);
  }
);

// club view applications
app.get("/club/:clubId/applications", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "club" ||
    req.session.user.id != req.params.clubId
  )
    return res.status(403).send("Forbidden");

  const user = await User.findByPk(req.params.clubId);
  if (!user || user.role !== "club")
    return res.status(404).send("Club not found");

  const applications = await Application.findAll({
    where: { clubId: req.params.clubId, status: "pending" },
  });

  res.render("clubApplications", { applications, user });
});

app.get("/api/subscriptions/:studentId", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "student" ||
    req.session.user.id != req.params.studentId
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const subscriptions = await Subscription.findAll({
      where: { studentId: req.params.studentId },
      include: [
        { model: User, as: "student" },
        {
          model: User,
          as: "club",
          attributes: ["id", "username"],
        },
      ],
    });
    res.json(subscriptions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Chat API Routes =====

// Get messages for a specific club
app.get("/messages/club/:clubId", requireLogin, async (req, res) => {
  try {
    // Only allow club members and the club itself to see messages
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const clubId = parseInt(req.params.clubId);
    let whereCondition = {};

    if (user.role === "student") {
      // Students can see messages from clubs they are subscribed to
      const subscription = await Subscription.findOne({
        where: { studentId: user.id, clubId },
      });
      if (!subscription) {
        return res
          .status(403)
          .json({ error: "You are not subscribed to this club" });
      }
      whereCondition = {
        [Op.or]: [
          { senderId: user.id, clubId },
          { senderId: clubId, clubId },
          { senderId: clubId, receiverId: user.id },
        ],
      };
    } else if (user.role === "club") {
      // Clubs can see messages in their room or broadcasts
      if (user.id !== clubId && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      whereCondition = {
        [Op.or]: [
          { clubId },
          { senderId: user.id, receiverId: null },
          { receiverId: user.id },
          // Remove { clubId: null, receiverId: null } - admin broadcasts will be shown in separate UI sections
        ],
      };
    } else if (user.role === "admin") {
      // Admin can see all messages
      whereCondition = {};
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const messages = await Message.findAll({
      where: whereCondition,
      include: [{ model: User, as: "sender", attributes: ["username"] }],
      order: [["timestamp", "ASC"]],
    });

    // Format messages with sender name
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender.username,
      receiverId: msg.receiverId,
      clubId: msg.clubId,
      message: msg.message,
      timestamp: msg.timestamp,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get messages for admin
app.get("/messages/admin", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).json({ error: "Forbidden" });

  try {
    const messages = await Message.findAll({
      include: [{ model: User, as: "sender", attributes: ["username"] }],
      order: [["timestamp", "ASC"]],
    });

    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender.username,
      receiverId: msg.receiverId,
      clubId: msg.clubId,
      message: msg.message,
      timestamp: msg.timestamp,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get admin broadcasts for clubs
app.get("/messages/admin/club/:clubId", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "club" ||
    req.session.user.id != req.params.clubId
  )
    return res.status(403).json({ error: "Forbidden" });

  try {
    // Get messages that would go to club_broadcast room
    // These are admin broadcasts that have been sent to clubs
    // We don't store the audience type in DB, so we'll return all admin broadcasts
    // The UI will need to filter this appropriately
    const messages = await Message.findAll({
      where: {
        clubId: null,
        receiverId: null,
        senderId: { [Op.ne]: req.params.clubId }, // Exclude club's own messages
      },
      include: [{ model: User, as: "sender", attributes: ["username"] }],
      order: [["timestamp", "ASC"]],
    });

    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender.username,
      receiverId: msg.receiverId,
      clubId: msg.clubId,
      message: msg.message,
      timestamp: msg.timestamp,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get messages for student
app.get("/messages/student/:studentId", requireLogin, async (req, res) => {
  if (
    req.session.user.role !== "student" ||
    req.session.user.id != req.params.studentId
  )
    return res.status(403).json({ error: "Forbidden" });

  try {
    const studentId = req.session.user.id;

    // Get all clubs the student is subscribed to
    const subscriptions = await Subscription.findAll({
      where: { studentId },
    });

    const subscribedClubIds = subscriptions.map((sub) => sub.clubId);

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { clubId: { [Op.in]: subscribedClubIds }, receiverId: null }, // Messages sent to club's room
          { receiverId: studentId }, // Direct messages
          { senderId: studentId }, // Messages sent by student
          { clubId: null, receiverId: null, adminTarget: "students" }, // Admin broadcasts to students only
        ],
      },
      include: [{ model: User, as: "sender", attributes: ["username"] }],
      order: [["timestamp", "ASC"]],
    });

    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender.username,
      receiverId: msg.receiverId,
      clubId: msg.clubId,
      message: msg.message,
      timestamp: msg.timestamp,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
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

    app.status = "accepted";
    await app.save();

    // Auto-subscribe the student to notifications for this club
    await Subscription.findOrCreate({
      where: { studentId: app.studentId, clubId: app.clubId },
    });

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

// ===== Socket.IO Setup =====
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware to share session data with Socket.IO
io.use((socket, next) => {
  const req = socket.request;
  req.session = req.session || {};

  // Simulate session parsing for now - in production you'd use proper session middleware
  // For simplicity, we'll assume session data is attached later in connection
  next();
});

// Socket.IO event handlers
io.on("connection", async (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-rooms", async (data) => {
    const { userId, role } = data;

    try {
      const user = await User.findByPk(userId);
      if (!user) {
        socket.emit("error", { message: "User not found" });
        return;
      }

      if (role === "student") {
        // Students join rooms for clubs they are subscribed to
        const subscriptions = await Subscription.findAll({
          where: { studentId: user.id },
        });
        subscriptions.forEach((sub) => {
          const room = `club_${sub.clubId}`;
          socket.join(room);
          console.log(`Student ${userId} joined room ${room}`);
        });

        // Students join student broadcast room for admin announcements
        socket.join("student_broadcast");
        console.log(`Student ${userId} joined student_broadcast room`);
      } else if (role === "club") {
        // Clubs join their own room
        const room = `club_${user.id}`;
        socket.join(room);
        console.log(`Club ${userId} joined room ${room}`);

        // Clubs join club broadcast room for admin announcements
        socket.join("club_broadcast");
        console.log(`Club ${userId} joined club_broadcast room`);
      } else if (role === "admin") {
        // Admin joins broadcast rooms for monitoring
        socket.join("student_broadcast");
        socket.join("club_broadcast");
        console.log(`Admin ${userId} joined broadcast rooms`);

        // Admin also joins all club rooms for monitoring
        const clubs = await User.findAll({ where: { role: "club" } });
        clubs.forEach((club) => {
          socket.join(`club_${club.id}`);
        });
      }
    } catch (err) {
      console.error("Error joining rooms:", err);
      socket.emit("error", { message: "Failed to join rooms" });
    }
  });

  socket.on("send-message", async (data) => {
    const { senderId, receiverId, clubId, message, target } = data;

    try {
      const sender = await User.findByPk(senderId);
      if (!sender) {
        socket.emit("error", { message: "Sender not found" });
        return;
      }

      // Validate permissions based on role
      if (sender.role === "student") {
        // Students can only message clubs they are subscribed to
        if (!clubId) {
          socket.emit("error", {
            message: "Students can only message subscribed clubs",
          });
          return;
        }
        const subscription = await Subscription.findOne({
          where: { studentId: senderId, clubId },
        });
        if (!subscription) {
          socket.emit("error", {
            message: "You are not subscribed to this club",
          });
          return;
        }
      } else if (sender.role === "club") {
        // Clubs can message subscribed students or admin
        if (receiverId) {
          // Check if receiver is admin
          const receiver = await User.findByPk(receiverId);
          if (!receiver || receiver.role !== "admin") {
            // Check if student is subscribed to this club
            const subscription = await Subscription.findOne({
              where: { studentId: receiverId, clubId: senderId },
            });
            if (!subscription) {
              socket.emit("error", {
                message: "You can only message subscribed students or admin",
              });
              return;
            }
          }
        }
      } else if (sender.role === "admin") {
        // Admin can message approved clubs or verified students
        if (receiverId) {
          const receiver = await User.findByPk(receiverId);
          if (!receiver) {
            socket.emit("error", { message: "Recipient not found" });
            return;
          }
          if (receiver.role === "club") {
            // All clubs in User table are approved, so okay
          } else if (receiver.role === "student") {
            if (!receiver.isVerified) {
              socket.emit("error", {
                message: "Can only message verified students",
              });
              return;
            }
          } else {
            socket.emit("error", { message: "Invalid recipient" });
            return;
          }
        } else {
          // For broadcasts, target should be specified
          if (!target || !["students", "clubs"].includes(target)) {
            socket.emit("error", { message: "Invalid broadcast target" });
            return;
          }
          // Broadcasts go to all approved clubs or verified students automatically
        }
      } else {
        socket.emit("error", { message: "Invalid user role" });
        return;
      }

      // Determine target audience for broadcasts
      let adminTarget = null;
      if (sender.role === "admin" && !receiverId && !clubId) {
        adminTarget = target; // 'students' or 'clubs'
      }

      // Save message to database
      const newMessage = await Message.create({
        senderId,
        receiverId: receiverId || null,
        clubId: clubId || null,
        message,
        adminTarget,
        timestamp: new Date(),
      });

      // Emit to appropriate rooms
      const messageData = {
        id: newMessage.id,
        senderId: newMessage.senderId,
        senderName: sender.username,
        receiverId: newMessage.receiverId,
        clubId: newMessage.clubId,
        message: newMessage.message,
        timestamp: newMessage.timestamp,
        adminTarget: newMessage.adminTarget,
      };

      if (clubId && sender.role === "student") {
        // Student to club: send to club room
        socket.to(`club_${clubId}`).emit("new-message", messageData);
      } else if (receiverId && sender.role === "club") {
        // Club to admin: send to admin room (but admin joins all rooms, so this works)
        // Club to student: send to club room for that student (but since receiver is specified, it should go to the receiver)
        // For now, since we don't have private rooms, we rely on front-end filtering
        socket.emit("new-message", messageData); // Echo back to sender
      } else if (sender.role === "admin" && receiverId) {
        // Admin direct message to specific user
        // Since rooms are club-based, we need to send to appropriate rooms
        const receiver = await User.findByPk(receiverId);
        if (receiver.role === "club") {
          socket.to(`club_${receiverId}`).emit("new-message", messageData);
        } else if (receiver.role === "student") {
          // Send to all club rooms the student is subscribed to, or create a special admin room
          // For simplicity, since front-end loads via API, we'll emit to student broadcast for now
          socket.to("student_broadcast").emit("new-message", messageData);
        }
      } else if (!receiverId) {
        // Broadcasts
        if (adminTarget === "students") {
          socket.to("student_broadcast").emit("new-message", messageData);
        } else if (adminTarget === "clubs") {
          socket.to("club_broadcast").emit("new-message", messageData);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ===== Start Server =====
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected!");
    await sequelize.sync({ alter: true }); // Update table structure
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

    // Seed default dean
    const deanEmail = process.env.DEAN_EMAIL;
    let dean = await User.findOne({ where: { email: deanEmail } });

    if (!dean) {
      const hashedPassword = await bcrypt.hash(process.env.DEAN_PASS, 10);
      dean = await User.create({
        username: "College Dean",
        email: deanEmail,
        password: hashedPassword,
        verificationToken: crypto.randomBytes(20).toString("hex"),
        role: "dean",
        isVerified: true,
        profile_data: { fullName: "College Dean" },
      });
      console.log("Default dean created!");
    }

    server.listen(3000, () =>
      console.log("Server running at http://localhost:3000")
    );
  } catch (err) {
    console.error("Database connection error:", err);
  }
})();
