import bcrypt from 'bcrypt'

export const BCRYPT_COST = 10

export async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash)
}
