const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");


const EventReport = sequelize.define(
"EventReport",
{
id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
eventId: { type: DataTypes.INTEGER, allowNull: false },
clubId: { type: DataTypes.INTEGER, allowNull: false },
summary: { type: DataTypes.TEXT, allowNull: true },
attendeesCount: { type: DataTypes.INTEGER, allowNull: true },
attachments: { type: DataTypes.JSON, defaultValue: [] }
},
{ tableName: 'event_reports', timestamps: true }
);


module.exports = { EventReport };
