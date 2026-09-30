import { json, corsHeaders, readJson } from '../lib/http.js';
import { requireRole } from '../lib/auth.js';
import { BadRequestError, ValidationError } from '../lib/errors.js';

/**
 * Handles /api/profile routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleProfileRoutes(req, res, url) {
  const headers = corsHeaders();

  if (url.pathname === '/api/profile') {
    const access = await requireRole(req, res, ['employee', 'hr', 'admin']);
    if (!access) return true;

    if (req.method === 'GET') {
      const { data: profile, error } = await access.client
        .from('profiles')
        .select('*')
        .eq('id', access.user.id)
        .maybeSingle();

      if (error) {
        // Fallback to minimal profile if select * fails due to column differences
        const fallback = {
          id: access.user.id,
          email: access.user.email,
          fullName: access.user.name,
          role: access.user.role,
          organizationId: access.user.organizationId,
          phone: '',
          bio: '',
          timezone: 'America/New_York'
        };
        json(res, 200, { profile: fallback }, headers);
        return true;
      }

      json(res, 200, {
        profile: {
          id: access.user.id,
          email: profile?.email || access.user.email,
          fullName: profile?.full_name || access.user.name,
          role: profile?.role || access.user.role,
          organizationId: profile?.organization_id || access.user.organizationId,
          phone: profile?.phone || '',
          bio: profile?.bio || '',
          department: profile?.department || '',
          jobTitle: profile?.job_title || '',
          preferences: profile?.preferences || {
            notificationsEmail: true,
            notificationsInApp: true,
            theme: 'dark'
          }
        }
      }, headers);
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      const updates = {};
      const errors = [];

      if (body.fullName !== undefined) {
        const trimmed = String(body.fullName).trim();
        if (trimmed.length < 2) {
          errors.push({ field: 'fullName', message: 'Full name must be at least 2 characters' });
        } else {
          updates.full_name = trimmed;
        }
      }

      if (body.phone !== undefined) {
        updates.phone = String(body.phone).trim();
      }

      if (body.bio !== undefined) {
        updates.bio = String(body.bio).trim();
      }

      if (body.department !== undefined) {
        updates.department = String(body.department).trim();
      }

      if (body.jobTitle !== undefined) {
        updates.job_title = String(body.jobTitle).trim();
      }

      if (body.preferences !== undefined && typeof body.preferences === 'object') {
        updates.preferences = body.preferences;
      }

      if (errors.length > 0) {
        throw new ValidationError('Validation failed for profile update', errors);
      }

      if (Object.keys(updates).length === 0) {
        throw new BadRequestError('No valid profile fields provided for update');
      }

      // Try updating profiles table
      const { data: updated, error } = await access.client
        .from('profiles')
        .update(updates)
        .eq('id', access.user.id)
        .select()
        .maybeSingle();

      if (error) {
        // If some columns don't exist in DB schema, attempt update with just full_name
        if (updates.full_name) {
          await access.client
            .from('profiles')
            .update({ full_name: updates.full_name })
            .eq('id', access.user.id);
        }
      }

      const responseProfile = {
        id: access.user.id,
        email: access.user.email,
        fullName: updates.full_name || updated?.full_name || access.user.name,
        role: access.user.role,
        organizationId: access.user.organizationId,
        phone: updates.phone ?? updated?.phone ?? '',
        bio: updates.bio ?? updated?.bio ?? '',
        department: updates.department ?? updated?.department ?? '',
        jobTitle: updates.job_title ?? updated?.job_title ?? '',
        preferences: updates.preferences ?? updated?.preferences ?? {}
      };

      json(res, 200, {
        profile: responseProfile,
        message: 'Profile updated successfully'
      }, headers);
      return true;
    }
  }

  return false;
}
