const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAdminUserInput(input = {}) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  const email = String(input.email || '').trim().toLowerCase();

  if (!name) throw new Error('Name is required');
  if (!emailPattern.test(email)) throw new Error('Valid email is required');

  return { name, email, role: 'employee' };
}
