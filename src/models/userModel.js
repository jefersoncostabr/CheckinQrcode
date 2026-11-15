import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    tipo_cliente: { type: String, enum: ['cliente', 'equipe'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, { timestamps: true })

userSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
    },
)

export default mongoose.model('User', userSchema, 'users')
