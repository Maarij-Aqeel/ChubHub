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
status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
adminNotes: { type: DataTypes.TEXT, allowNull: true }
},
{ tableName: 'club_requests', timestamps: true }
);


module.exports = { ClubRequest };
