const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");


const Application = sequelize.define(
"Application",
{
id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
clubId: { type: DataTypes.INTEGER, allowNull: false },
studentId: { type: DataTypes.INTEGER, allowNull: false },
message: { type: DataTypes.TEXT, allowNull: true },
status: { type: DataTypes.ENUM('pending','accepted','rejected'), defaultValue: 'pending' }
},
{ tableName: 'applications', timestamps: true }
);


module.exports = { Application };
