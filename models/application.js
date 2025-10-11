const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Application = sequelize.define(
  "Application",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clubId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },

    // Student Information
    email: { type: DataTypes.STRING, allowNull: false },
    studentName: { type: DataTypes.STRING, allowNull: false },
    gender: {
      type: DataTypes.ENUM("Male", "Female", "Other"),
      allowNull: false,
    },
    major: { type: DataTypes.STRING, allowNull: false },
    academicYear: {
      type: DataTypes.ENUM(
        "Freshman",
        "Sophomore",
        "Junior",
        "Senior",
        "Graduate"
      ),
      allowNull: false,
    },
    skills: { type: DataTypes.TEXT, allowNull: false },
    motivation: { type: DataTypes.TEXT, allowNull: false },

    // Legacy field for backward compatibility
    message: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      defaultValue: "pending",
    },
    clubNotes: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "applications", timestamps: true }
);

module.exports = { Application };
