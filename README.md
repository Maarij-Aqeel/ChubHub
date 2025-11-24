# Chubhub

Chubhub is a comprehensive web application for managing university club activities, built with Node.js, Express, MySQL (Sequelize ORM), and Socket.io for real-time messaging. It supports multiple user roles including students, clubs, administrators, and deans, providing a platform for club registration, event management, membership applications, and communication.

## Prerequisites

### For Windows Users

1. **Node.js** (version 16 or higher)
   - Download from [https://nodejs.org/](https://nodejs.org/)
   - Choose the LTS version
   - Verify installation: `node --version` and `npm --version`

2. **MySQL Server** (version 8.0 or higher recommended)
   - Download MySQL Installer from [https://dev.mysql.com/downloads/installer/](https://dev.mysql.com/downloads/installer/)
   - Install MySQL Server, MySQL Workbench (optional but recommended)
   - During installation, note the root password you set
   - Add MySQL to PATH environment variable

3. **Git** (for cloning the repository)
   - Download from [https://git-scm.com/downloads](https://git-scm.com/downloads)

4. **Text Editor/IDE** (Visual Studio Code recommended)
   - Download from [https://code.visualstudio.com/](https://code.visualstudio.com/)

## Installation and Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration (update with your MySQL credentials)
MYSQLDATABASE=Chubhub
MYSQLUSER=root
MYSQLPASSWORD=your_mysql_password_here
MYSQLHOST=localhost
MYSQLPORT=3306

# Admin Account (used to create initial admin user)
ADMIN_EMAIL=admin@university.edu
ADMIN_PASS=admin123

# Dean Account (used to create initial dean user)
DEAN_EMAIL=dean@university.edu
DEAN_PASS=dean123

# Email Configuration (for notifications)
RESEND_API_KEY=your_resend_api_key_here
FROM_EMAIL=noreply@university.edu

# Application Settings
PORT=3000
NODE_ENV=development
```

**Note for Windows users:** Ensure your MySQL service is running. You can start it from:
- Services.msc (search for "MySQL" service), or
- MySQL Workbench, or
- Command prompt: `net start mysql`

### 4. Database Setup
1. Create the database:
   - Open MySQL Workbench or command line
   - Create database: `CREATE DATABASE Chubhub;`

2. The application will automatically create tables and seed initial users when started.

### 5. Run the Application
```bash
npm start
```

The server will start on `http://localhost:3000`

### 6. Access the Application
- Open your browser and go to `http://localhost:3000`
- Initial login credentials:
  - Admin: Use the ADMIN_EMAIL and ADMIN_PASS from your .env file
  - Dean: Use the DEAN_EMAIL and DEAN_PASS from your .env file

## Features

### User Management
- **Multi-role Authentication**: Student, Club, Admin, and Dean accounts
- **Email Verification**: Secure account activation
- **Password Reset**: Via email reset links
- **Session Management**: Automatic logout after 15 minutes of inactivity

### Club Management
- **Club Registration**: Clubs submit detailed applications including:
  - Basic information (name, kind: Academic/Non-Academic, description)
  - Leadership details (president, VP, advisor)
  - Member information and contacts
  - Documentation uploads
- **Approval Workflow**:
  - Academic clubs: Submitted → Admin Pre-Approval → Dean Final Approval
  - Non-Academic clubs: Submitted → Admin Direct Approval

### Student Features
- **Browse Clubs**: Search and filter available clubs
- **Club Subscriptions**: Follow clubs for notifications and updates
- **Membership Applications**: Apply to join clubs with detailed forms
- **Event Management**: View upcoming events, RSVP, receive notifications
- **Profile Management**: CV upload, personal information, social links

### Club Administration
- **Post Management**: Create and share updates with subscribers
- **Event Creation**: Submit event proposals with documentation
- **Application Review**: Approve/reject student membership applications
- **Event Reports**: Required post-event documentation and evaluation
- **Real-time Messaging**: Direct and group communication

### Admin Dashboard
- **User Oversight**: Manage students, clubs, and administrators
- **Content Moderation**: Approve/reject posts and events
- **Club Approvals**: Review and approve club registration requests
- **Audit Logging**: Track all administrative actions
- **System Statistics**: Overview of platform usage

### Dean Dashboard
- **Academic Club Oversight**: Final approval for academic club registrations
- **Event Approvals**: Approve academic club events
- **Institutional Oversight**: Monitor club activities and compliance

### Communication System
- **Real-time Messaging**: Socket.io-powered instant messaging
- **Message Types**:
  - Direct: Club-Student, Club-Admin communications
  - Group: Club broadcast to subscribers
  - Broadcast: Admin announcements to all students or clubs
- **Chat Rooms**: Organized conversation spaces

### Event Management
- **Event Creation**: Detailed proposals with attachments
- **Approval Process**: Separate workflows by club type
- **RSVP System**: Attendee management with capacity limits
- **Post-Event Reporting**: Mandatory reports after event completion
- **Notifications**: Automatic email alerts for subscribers

### File Upload System
- **Supported Formats**: Images, videos, PDFs, Word documents
- **Image Processing**: Automatic resizing and optimization
- **Document Management**: Organized storage in uploads directory
- **Security**: File type validation and size limits

### Notification System
- **Email Notifications**: Node-resend integration
- **Trigger Events**:
  - Account approvals/rejections
  - New posts from subscribed clubs
  - Event announcements
  - RSVP confirmations
  - System messages

## Architecture

### Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: MySQL with Sequelize ORM
- **Real-time Features**: Socket.io
- **Templating**: EJS
- **Authentication**: bcrypt for password hashing, JWT tokens
- **File Processing**: Multer, Sharp
- **Email**: Resend API
- **Frontend**: Vanilla JavaScript, CSS, Bootstrap components

### Key Dependencies
- `express`: Web framework
- `sequelize`: Database ORM
- `mysql2`: MySQL driver
- `socket.io`: Real-time communication
- `bcryptjs`: Password encryption
- `multer`: File uploads
- `sharp`: Image processing
- `resend`: Email service

## Project Structure
```
├── app.js                 # Main application file
├── config/               # Configuration files
│   ├── database.js       # Database connection
│   └── mailer.js         # Email configuration
├── models/               # Database models (Sequelize)
│   ├── user.js           # User accounts
│   ├── clubRequest.js    # Club registration requests
│   ├── event.js          # Events
│   ├── post.js           # Club posts
│   ├── message.js        # Chat messages
│   └── ...
├── views/                # EJS templates
├── public/               # Static assets (CSS, JS, images)
├── uploads/              # User-uploaded files
├── package.json          # Dependencies and scripts
└── .env                  # Environment variables (create this)
```

## API Endpoints

The application includes RESTful endpoints for:
- User authentication (login, signup, password reset)
- Club management and approvals
- Event creation and management
- Post management
- Application processing
- Real-time messaging channels

## Deployment

For production deployment:
- Set `NODE_ENV=production` in .env
- Configure production database (supports Railway/MySQL cloud)
- Set up proper SSL certificates
- Configure production email service
- Set up process manager (PM2 recommended)

