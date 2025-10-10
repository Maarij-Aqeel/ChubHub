const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");


const EventReport = sequelize.define(
"EventReport",
{
id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
eventId: { type: DataTypes.INTEGER, allowNull: false },
clubId: { type: DataTypes.INTEGER, allowNull: false },

// Basic Information
clubName: { type: DataTypes.STRING, allowNull: false },
facultyAdviserName: { type: DataTypes.STRING, allowNull: false },
activityTitle: { type: DataTypes.STRING, allowNull: false },
activityDate: { type: DataTypes.DATE, allowNull: false },
activityLocation: { type: DataTypes.STRING, allowNull: false },

// Activity Details
purposeOfActivity: { type: DataTypes.TEXT, allowNull: false },
activityDescription: { type: DataTypes.TEXT, allowNull: false },
managingStudents: { type: DataTypes.TEXT, allowNull: false },
participatingStudents: { type: DataTypes.TEXT, allowNull: false },
numberOfAttendance: { type: DataTypes.INTEGER, allowNull: false },
evaluationResults: { type: DataTypes.TEXT, allowNull: false },
recommendations: { type: DataTypes.TEXT, allowNull: false },

// Attachments
photos: { type: DataTypes.JSON, defaultValue: [] },
attendanceSheet: { type: DataTypes.JSON, defaultValue: [] },
receiptsAndLiquidation: { type: DataTypes.JSON, defaultValue: [] },
activityProposal: { type: DataTypes.JSON, defaultValue: [] },
supportingDocuments: { type: DataTypes.JSON, defaultValue: [] },

// Legacy fields for backward compatibility
summary: { type: DataTypes.TEXT, allowNull: true },
attendeesCount: { type: DataTypes.INTEGER, allowNull: true },
attachments: { type: DataTypes.JSON, defaultValue: [] }
},
{ tableName: 'event_reports', timestamps: true }
);


module.exports = { EventReport };
