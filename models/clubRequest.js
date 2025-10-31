const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");


const ClubRequest = sequelize.define(
"ClubRequest",
{
id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
clubName: { type: DataTypes.STRING(150), allowNull: false },
clubEmail: { type: DataTypes.STRING(150), allowNull: false, validate: { isEmail: true } },
clubDescription: { type: DataTypes.TEXT, allowNull: true },
representativeName: { type: DataTypes.STRING(150), allowNull: true },
passwordHash: { type: DataTypes.STRING, allowNull: false },
status: { type: DataTypes.ENUM('pending','admin_approved','approved','rejected'), defaultValue: 'pending' },
adminNotes: { type: DataTypes.TEXT, allowNull: true },

// New fields from signup form
clubKind: { type: DataTypes.ENUM('Academic','Non Academic'), allowNull: true },
clubStatus: { type: DataTypes.ENUM('Existing','New'), allowNull: true },
clubVision: { type: DataTypes.TEXT, allowNull: true },
clubActivities: { type: DataTypes.TEXT, allowNull: true },

// President
presidentName: { type: DataTypes.STRING(150), allowNull: true },
presidentStudentID: { type: DataTypes.STRING(50), allowNull: true },
presidentPhone: { type: DataTypes.STRING(50), allowNull: true },
presidentCollege: { type: DataTypes.STRING(100), allowNull: true },

// Vice President
vpName: { type: DataTypes.STRING(150), allowNull: true },
vpStudentID: { type: DataTypes.STRING(50), allowNull: true },
vpPhone: { type: DataTypes.STRING(50), allowNull: true },

// Members
member1: { type: DataTypes.STRING(150), allowNull: true },
member2: { type: DataTypes.STRING(150), allowNull: true },
member3: { type: DataTypes.STRING(150), allowNull: true },
member4: { type: DataTypes.STRING(150), allowNull: true },
member5: { type: DataTypes.STRING(150), allowNull: true },

// Advisor
advisorName: { type: DataTypes.STRING(150), allowNull: true },
advisorEmail: { type: DataTypes.STRING(150), allowNull: true, validate: { isEmail: true } },
advisorSignature: { type: DataTypes.TEXT, allowNull: true },

// Social and misc
clubSocials: { type: DataTypes.TEXT, allowNull: true },
clubMembersCount: { type: DataTypes.INTEGER, allowNull: true },
clubFair: { type: DataTypes.ENUM('Yes','No'), allowNull: true },
clubLogo: { type: DataTypes.TEXT, allowNull: true },

// Approvals
deanName: { type: DataTypes.STRING(150), allowNull: true },
deanSignature: { type: DataTypes.TEXT, allowNull: true },
deanApprovalDate: { type: DataTypes.DATE, allowNull: true },
deanApproved: { type: DataTypes.BOOLEAN, defaultValue: false },
deanNotes: { type: DataTypes.TEXT, allowNull: true },

isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
verificationToken: { type: DataTypes.STRING(42), allowNull: true },

dsaName: { type: DataTypes.STRING(150), allowNull: true },
dsaSignature: { type: DataTypes.TEXT, allowNull: true },
dsaApprovalDate: { type: DataTypes.DATE, allowNull: true },

approvedByAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
adminApprovalDate: { type: DataTypes.DATE, allowNull: true }
},
{ tableName: 'club_requests', timestamps: true }
);


module.exports = { ClubRequest };
