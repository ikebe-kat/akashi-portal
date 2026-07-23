export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);
