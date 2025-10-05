const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");
const  User  = require("./models/user");
const  Post = require("./models/post");
const { sequelize } = require("./config/database");
const { ClubRequest } = require("./models/clubRequest");
const { Event } = require("./models/event");
const { EventReport } = require("./models/eventReport");
const { Application } = require("./models/application");
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
  })
);

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
  res.redirect("/login");
});

// ===== Signup =====
app.get("/signup", (req, res) => res.render("signup", { error: null, message: null }));

app.post("/signup", async (req, res) => {
  const { role } = req.body;
  let username, email, password, confirmPassword, profileData;

  try {
    if (role === "student") {
      // === Student signup ===
      const { fullName, studentEmail, studentPassword, studentConfirmPassword } = req.body;
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

      if (!/^\d{9}@psu\.edu\.sa$/.test(email))
        return res.render("signup", { error: "Invalid PSU email format!", message: null });

      if (password.length < 8)
        return res.render("signup", { error: "Password must be at least 8 characters!", message: null });
      if (password !== confirmPassword)
        return res.render("signup", { error: "Passwords do not match!", message: null });

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        role: "student",
        profile_data: profileData,
      });

      req.session.user = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        profile_data: newUser.profile_data,
      };

      return res.redirect(`/student/${newUser.id}/home`);
    }

    else if (role === "club") {
      // === Club signup → save as ClubRequest instead of User ===
      const { clubName, clubEmail, clubDescription, representativeName, clubPassword, clubConfirmPassword } = req.body;
      email = clubEmail.trim().toLowerCase();
      username = clubName.trim();
      password = clubPassword;
      confirmPassword = clubConfirmPassword;

      if (password.length < 8)
        return res.render("signup", { error: "Password must be at least 8 characters!", message: null });
      if (password !== confirmPassword)
        return res.render("signup", { error: "Passwords do not match!", message: null });

      const hashedPassword = await bcrypt.hash(password, 10);

      await ClubRequest.create({
        clubName: username,
        clubEmail: email,
        passwordHash: hashedPassword,
        clubDescription,
        representativeName,
        status: "pending"
      });

      return res.render("signup", {
        error: null,
        message: "Your club request has been submitted. Please wait for admin approval."
      });
    }

    else {
      return res.render("signup", { error: "Please select a role", message: null });
    }

  } catch (err) {
    console.error(err);
    if (err.name === "SequelizeUniqueConstraintError")
      return res.render("signup", { error: "Email already exists!", message: null });
    res.render("signup", { error: "Something went wrong!", message: null });
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

// ===== Logout =====
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Admin - view pending club requests
app.get('/admin/club-requests', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  const requests = await ClubRequest.findAll({ where: { status: 'pending' }, order: [['createdAt', 'ASC']] });
  res.render('adminClubRequests', { requests });
});


// Approve
app.post('/admin/club-requests/:id/approve', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  const reqId = req.params.id;
  const creq = await ClubRequest.findByPk(reqId);
  if (!creq) return res.status(404).send('Not found');


  // create actual User entry
  const newUser = await User.create({
    username: creq.clubName,
    email: creq.clubEmail,
    password: creq.passwordHash,
    role: 'club',
    profile_data: { clubDescription: creq.clubDescription, representativeName: creq.representativeName }
  });


  creq.status = 'approved';
  await creq.save();
  res.redirect('/admin/club-requests');
});


// Reject
app.post('/admin/club-requests/:id/reject', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  const reqId = req.params.id;
  const creq = await ClubRequest.findByPk(reqId);
  if (!creq) return res.status(404).send('Not found');
  creq.status = 'rejected';
  creq.adminNotes = req.body.adminNotes || '';
  await creq.save();
  res.redirect('/admin/club-requests');
});

// ===== Student Home =====
app.get("/student/:id/home", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "student") return res.status(404).send("Student not found");

  const allPosts = await Post.findAll({
    order: [["createdAt", "DESC"]],
  });

  res.render("homepage", { user, allPosts });
});

// ===== Student Profile =====
app.get("/student/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "student") return res.status(404).send("Student not found");

  res.render("studentProfile", { user, posts: [] });
});

// ===== Club Profile =====
app.get("/club/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "club") return res.status(404).send("Club not found");

  // Fetch club posts
  const posts = await Post.findAll({
    where: { clubId: user.id },
    order: [["createdAt", "DESC"]],
  });

  // Fetch only approved events
  const events = await Event.findAll({
    where: { clubId: user.id, status: 'approved' },
    order: [['startsAt', 'ASC']]
  });

  res.render("clubProfile", { user, posts, events });
});

// ===== Add Post (Club only) =====
app.post("/club/:id/addPost", requireLogin, upload.single("media"), async (req, res) => {
  try {
    const club = await User.findByPk(req.params.id);
    if (!club || club.role !== "club") return res.status(403).send("Invalid club");

    const text = req.body.content?.trim() || ""; // matches your textarea name

    let image = null;
    let video = null;

    if (req.file) {
      console.log("Uploaded file:", req.file); // debug
      if (req.file.mimetype.startsWith("image/")) image = "/uploads/" + req.file.filename;
      else if (req.file.mimetype.startsWith("video/")) video = "/uploads/" + req.file.filename;
    }


    await Post.create({ clubId: club.id, text, image, video });
    res.redirect(`/club/${club.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// Club: create event form
app.get('/club/:id/event/new', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.id) return res.status(403).send('Forbidden');
  res.render('eventForm', { error: null });
});


app.post('/club/:id/event/new', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.id) return res.status(403).send('Forbidden');
  const { title, description, location, startsAt, endsAt } = req.body;
  await Event.create({ clubId: req.session.user.id, title, description, location, startsAt: startsAt || null, endsAt: endsAt || null, status: 'pending' });
  res.redirect(`/club/${req.session.user.id}`);
});

// Admin view pending events
app.get("/admin/events", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin") return res.status(403).send("Forbidden");

  const pendingEvents = await Event.findAll({
    where: { status: "pending" },
    include: [{ model: User, as: "club", attributes: ["id", "username", "email"] }],
    order: [["createdAt", "ASC"]],
  });

  res.render("adminEvents", { pendingEvents });
});

// Approve
app.post("/admin/events/:eventId/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin") return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");

  event.status = "approved";
  await event.save();

  res.redirect("/admin/events");
});

// Reject
app.post("/admin/events/:eventId/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== "admin") return res.status(403).send("Forbidden");

  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send("Event not found");

  event.status = "rejected";
  event.adminNotes = req.body.adminNotes || "";
  await event.save();

  res.redirect("/admin/events");
});

// show report form
app.get('/club/:id/event/:eventId/report', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.id) return res.status(403).send('Forbidden');
  const event = await Event.findByPk(req.params.eventId);
  if (!event) return res.status(404).send('Event not found');
  res.render('eventReportForm', { event, error: null });
});


// submit report
app.post('/club/:id/event/:eventId/report', requireLogin, upload.array('attachments', 5), async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.id) return res.status(403).send('Forbidden');
  const { summary, attendeesCount } = req.body;
  const attachments = (req.files || []).map(f => f.path.replace(/\\/g, '/'));
  await EventReport.create({ eventId: req.params.eventId, clubId: req.session.user.id, summary, attendeesCount: parseInt(attendeesCount) || 0, attachments });
  res.redirect(`/club/${req.session.user.id}`);
});
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

      if (user.role === "student") {
        const { fullName, bio, phone, linkedin } = req.body;

        const profilePic =
          req.files["profilePic"]?.[0]?.path.replace(/\\/g, "/") || user.profile_data.profilePic;
        const cv =
          req.files["cv"]?.[0]?.path.replace(/\\/g, "/") || user.profile_data.cv;

        user.profile_data = {
          ...user.profile_data,
          fullName,
          bio,
          phone,
          linkedin,
          profilePic,
          cv,
        };

        user.username = fullName;
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

        user.profile_data = {
          ...user.profile_data,
          clubName,
          clubDescription,
          representativeName,
          email,
          phone,
          linkedin,
          instagram,
          tiktok,
          x,
        };

        user.username = clubName;
      }

      await user.save();

      req.session.user = {
        ...req.session.user,
        username: user.username,
        profile_data: user.profile_data,
      };

      res.redirect(user.role === "student" ? `/student/${user.id}` : `/club/${user.id}`);
    } catch (err) {
      console.error(err);
      res.send("Something went wrong!");
    }
  }
);

// ===== Admin Profile =====
app.get("/admin/:id", requireLogin, async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user || user.role !== "admin") return res.status(404).send("Admin not found");

  const studentCount = await User.count({ where: { role: "student" } });
  const clubCount = await User.count({ where: { role: "club" } });
  const postsCount = await Post.count();

  res.render("adminProfile", {
    user,
    stats: {
      students: studentCount,
      clubs: clubCount,
      posts: postsCount,
    },
  });
});

// Show application form
app.get("/student/:studentId/apply/:clubId", requireLogin, async (req, res) => {
  if (req.session.user.role !== "student" || req.session.user.id != req.params.studentId)
    return res.status(403).send("Forbidden");

  const club = await User.findByPk(req.params.clubId);
  if (!club || club.role !== "club") return res.status(404).send("Club not found");

  res.render("applicationForm", { club, error: null });
});

// Submit application
app.post("/student/:studentId/apply/:clubId", requireLogin, async (req, res) => {
  if (req.session.user.role !== "student" || req.session.user.id != req.params.studentId)
    return res.status(403).send("Forbidden");

  const club = await User.findByPk(req.params.clubId);
  if (!club || club.role !== "club") return res.status(404).send("Club not found");

  const { message } = req.body;

  await Application.create({
    studentId: req.session.user.id,
    clubId: club.id,
    message,
    status: "pending"
  });

  res.send("Your application has been submitted!"); // or redirect to student home
});

// club view applications
app.get("/club/:clubId/applications", requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.clubId) return res.status(403).send('Forbidden');

  const applications = await Application.findAll({
    where: { clubId: req.params.clubId, status: 'pending' },
    include: [{ model: User, as: 'student', attributes: ['id', 'username', 'email'] }]
  });

  res.render("clubApplications", { applications });
});

//club approve or reject
app.post("/club/:clubId/applications/:appId/approve", requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.clubId) return res.status(403).send('Forbidden');

  const app = await Application.findByPk(req.params.appId);
  if (!app) return res.status(404).send("Application not found");

  app.status = "approved";
  await app.save();

  res.redirect(`/club/${req.params.clubId}/applications`);
});

app.post("/club/:clubId/applications/:appId/reject", requireLogin, async (req, res) => {
  if (req.session.user.role !== 'club' || req.session.user.id != req.params.clubId) return res.status(403).send('Forbidden');

  const app = await Application.findByPk(req.params.appId);
  if (!app) return res.status(404).send("Application not found");

  app.status = "rejected";
  app.clubNotes = req.body.clubNotes || "";
  await app.save();

  res.redirect(`/club/${req.params.clubId}/applications`);
});


// ===== Start Server =====
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected!");
    await sequelize.sync({ alter: true });
    console.log("All models synced!");

    // Seed default admin
    const adminEmail = "admin@clubhub.com";
    let admin = await User.findOne({ where: { email: adminEmail } });

    if (!admin) {
      const hashedPassword = await bcrypt.hash("Admin1234!", 10);
      admin = await User.create({
        username: "Super Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        profile_data: { fullName: "Super Admin" },
      });
      console.log("Default admin created!");
    }

    app.listen(3000, () => console.log("Server running at http://localhost:3000"));
  } catch (err) {
    console.error("Database connection error:", err);
  }
})();
