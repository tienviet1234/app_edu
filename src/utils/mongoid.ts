/** Returns true if the string is a valid 24-char MongoDB ObjectId hex string. */
export const isMongoid = (id: string): boolean => /^[a-f0-9]{24}$/i.test(id)
