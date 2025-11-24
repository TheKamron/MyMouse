const {Schema, model} = require('mongoose')

const UserSchema = new Schema({
    username: {type: String, required: true}
}, {timestamps: true})


const User = model('User', UserSchema)

module.exports = User