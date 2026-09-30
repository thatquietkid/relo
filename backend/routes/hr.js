import crypto from 'node:crypto';
import { json, corsHeaders, readJson } from '../lib/http.js';
import { requireRole } from '../lib/auth.js';
import { BadRequestError, NotFoundError, ValidationError } from '../lib/errors.js';

// Seed initial properties
let propertiesStore = [
  {
    id: 'prop-001',
    organizationId: null,
    title: 'The Kensington Executive Suites',
    address: '42 Kensington High Street',
    city: 'London',
    country: 'United Kingdom',
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    rentMonthly: 2850,
    deposit: 3000,
    availableFrom: '2026-10-15',
    amenities: ['Furnished', 'Concierge', 'High-Speed Wi-Fi', 'Gym', 'Pet Friendly'],
    description: 'Modern luxury 2-bed apartment situated in prime Kensington, 5 mins from Kensington tube station.',
    contactEmail: 'relo-housing@relo-global.internal',
    contactPhone: '+44 20 7946 0912',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prop-002',
    organizationId: null,
    title: 'Mitte Loft Residences',
    address: 'Torstraße 178',
    city: 'Berlin',
    country: 'Germany',
    propertyType: 'studio',
    bedrooms: 1,
    bathrooms: 1,
    rentMonthly: 1650,
    deposit: 2000,
    availableFrom: '2026-11-01',
    amenities: ['Furnished', 'Balcony', 'Bicycle Storage', 'Floor Heating'],
    description: 'Bright open-concept industrial loft in central Berlin Mitte with high ceilings and modern kitchen.',
    contactEmail: 'berlin-housing@relo-global.internal',
    contactPhone: '+49 30 1234567',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prop-003',
    organizationId: null,
    title: 'Hudson Yards Corporate Tower',
    address: '500 W 33rd St',
    city: 'New York',
    country: 'United States',
    propertyType: 'condo',
    bedrooms: 1,
    bathrooms: 1.5,
    rentMonthly: 4200,
    deposit: 4200,
    availableFrom: '2026-10-01',
    amenities: ['Doorman', 'Sky Lounge', 'In-Unit Washer/Dryer', 'Fitness Center'],
    description: 'Sleek luxury residence with Hudson River views, minutes from tech headquarters and transit.',
    contactEmail: 'ny-relocation@relo-global.internal',
    contactPhone: '+1 212 555 0199',
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

// Seed initial cohorts
let cohortsStore = [
  {
    id: 'cohort-001',
    organizationId: null,
    name: 'Q4 2026 Tech Expansion - London',
    destinationCity: 'London',
    destinationCountry: 'United Kingdom',
    startDate: '2026-10-01',
    targetDate: '2026-12-15',
    memberCount: 14,
    budgetPerEmployee: 12500,
    description: 'Relocating European core engineering and product leadership to London central headquarters.',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'cohort-002',
    organizationId: null,
    name: 'Berlin AI Research Lab Launch',
    destinationCity: 'Berlin',
    destinationCountry: 'Germany',
    startDate: '2026-11-15',
    targetDate: '2027-02-01',
    memberCount: 8,
    budgetPerEmployee: 9800,
    description: 'Specialist relocation cohort for foundation model and multimodal ML researchers.',
    status: 'planning',
    createdAt: new Date().toISOString()
  },
  {
    id: 'cohort-003',
    organizationId: null,
    name: 'NYC Go-To-Market Transfer',
    destinationCity: 'New York',
    destinationCountry: 'United States',
    startDate: '2026-08-01',
    targetDate: '2026-09-30',
    memberCount: 6,
    budgetPerEmployee: 15000,
    description: 'Commercial enterprise sales cohort transfer for North American expansion.',
    status: 'completed',
    createdAt: new Date().toISOString()
  }
];

/**
 * Handles /api/hr/properties and /api/hr/cohorts routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleHrRoutes(req, res, url) {
  const headers = corsHeaders();

  // HR Properties Routes
  if (url.pathname === '/api/hr/properties') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;

    if (req.method === 'GET') {
      const city = url.searchParams.get('city')?.toLowerCase();
      const status = url.searchParams.get('status')?.toLowerCase();
      const type = url.searchParams.get('type')?.toLowerCase();

      let results = [...propertiesStore];
      if (city) {
        results = results.filter((p) => p.city.toLowerCase().includes(city));
      }
      if (status) {
        results = results.filter((p) => p.status.toLowerCase() === status);
      }
      if (type) {
        results = results.filter((p) => p.propertyType.toLowerCase() === type);
      }

      json(res, 200, { properties: results, count: results.length }, headers);
      return true;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const errors = [];

      if (!body.title || typeof body.title !== 'string' || body.title.trim().length < 3) {
        errors.push({ field: 'title', message: 'Property title is required (min 3 chars)' });
      }
      if (!body.address || typeof body.address !== 'string' || body.address.trim().length < 3) {
        errors.push({ field: 'address', message: 'Street address is required' });
      }
      if (!body.city || typeof body.city !== 'string') {
        errors.push({ field: 'city', message: 'City is required' });
      }
      if (!body.rentMonthly || Number(body.rentMonthly) <= 0) {
        errors.push({ field: 'rentMonthly', message: 'Monthly rent must be a positive number' });
      }

      if (errors.length > 0) {
        throw new ValidationError('Validation failed for new property listing', errors);
      }

      const newProperty = {
        id: `prop-${crypto.randomBytes(4).toString('hex')}`,
        organizationId: access.user.organizationId || null,
        title: String(body.title).trim(),
        address: String(body.address).trim(),
        city: String(body.city).trim(),
        country: String(body.country || 'Global').trim(),
        propertyType: String(body.propertyType || 'apartment').toLowerCase(),
        bedrooms: Number(body.bedrooms || 1),
        bathrooms: Number(body.bathrooms || 1),
        rentMonthly: Number(body.rentMonthly),
        deposit: Number(body.deposit || body.rentMonthly),
        availableFrom: String(body.availableFrom || new Date().toISOString().split('T')[0]),
        amenities: Array.isArray(body.amenities)
          ? body.amenities
          : typeof body.amenities === 'string'
            ? body.amenities.split(',').map((s) => s.trim()).filter(Boolean)
            : ['Furnished', 'Wi-Fi'],
        description: String(body.description || '').trim(),
        contactEmail: String(body.contactEmail || access.user.email).trim(),
        contactPhone: String(body.contactPhone || '').trim(),
        status: String(body.status || 'active').toLowerCase(),
        createdAt: new Date().toISOString()
      };

      propertiesStore.unshift(newProperty);

      json(res, 201, {
        property: newProperty,
        message: 'Property listed successfully'
      }, headers);
      return true;
    }
  }

  // Single property update / delete
  if (url.pathname.startsWith('/api/hr/properties/')) {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;
    const propertyId = url.pathname.slice('/api/hr/properties/'.length);

    const index = propertiesStore.findIndex((p) => p.id === propertyId);
    if (index === -1) {
      throw new NotFoundError(`Property with ID ${propertyId} not found`);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      const existing = propertiesStore[index];
      const updated = {
        ...existing,
        title: body.title !== undefined ? String(body.title).trim() : existing.title,
        address: body.address !== undefined ? String(body.address).trim() : existing.address,
        city: body.city !== undefined ? String(body.city).trim() : existing.city,
        rentMonthly: body.rentMonthly !== undefined ? Number(body.rentMonthly) : existing.rentMonthly,
        propertyType: body.propertyType !== undefined ? String(body.propertyType).toLowerCase() : existing.propertyType,
        status: body.status !== undefined ? String(body.status).toLowerCase() : existing.status,
        description: body.description !== undefined ? String(body.description).trim() : existing.description,
        updatedAt: new Date().toISOString()
      };
      propertiesStore[index] = updated;

      json(res, 200, { property: updated, message: 'Property updated' }, headers);
      return true;
    }

    if (req.method === 'DELETE') {
      const [removed] = propertiesStore.splice(index, 1);
      json(res, 200, { removed: true, id: removed.id, message: 'Property removed from listings' }, headers);
      return true;
    }
  }

  // HR Cohorts Routes
  if (url.pathname === '/api/hr/cohorts') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;

    if (req.method === 'GET') {
      const status = url.searchParams.get('status')?.toLowerCase();
      let results = [...cohortsStore];
      if (status) {
        results = results.filter((c) => c.status.toLowerCase() === status);
      }
      json(res, 200, { cohorts: results, count: results.length }, headers);
      return true;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const errors = [];

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 3) {
        errors.push({ field: 'name', message: 'Cohort name is required (min 3 chars)' });
      }
      if (!body.destinationCity || typeof body.destinationCity !== 'string') {
        errors.push({ field: 'destinationCity', message: 'Destination city is required' });
      }

      if (errors.length > 0) {
        throw new ValidationError('Validation failed for new cohort', errors);
      }

      const newCohort = {
        id: `cohort-${crypto.randomBytes(4).toString('hex')}`,
        organizationId: access.user.organizationId || null,
        name: String(body.name).trim(),
        destinationCity: String(body.destinationCity).trim(),
        destinationCountry: String(body.destinationCountry || 'Global').trim(),
        startDate: String(body.startDate || new Date().toISOString().split('T')[0]),
        targetDate: String(body.targetDate || ''),
        memberCount: Number(body.memberCount || 0),
        budgetPerEmployee: Number(body.budgetPerEmployee || 10000),
        description: String(body.description || '').trim(),
        status: String(body.status || 'planning').toLowerCase(),
        createdAt: new Date().toISOString()
      };

      cohortsStore.unshift(newCohort);

      json(res, 201, {
        cohort: newCohort,
        message: 'Cohort created successfully'
      }, headers);
      return true;
    }
  }

  // Single cohort update
  if (url.pathname.startsWith('/api/hr/cohorts/')) {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;
    const cohortId = url.pathname.slice('/api/hr/cohorts/'.length);

    const index = cohortsStore.findIndex((c) => c.id === cohortId);
    if (index === -1) {
      throw new NotFoundError(`Cohort with ID ${cohortId} not found`);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      const existing = cohortsStore[index];
      const updated = {
        ...existing,
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        destinationCity: body.destinationCity !== undefined ? String(body.destinationCity).trim() : existing.destinationCity,
        memberCount: body.memberCount !== undefined ? Number(body.memberCount) : existing.memberCount,
        status: body.status !== undefined ? String(body.status).toLowerCase() : existing.status,
        description: body.description !== undefined ? String(body.description).trim() : existing.description,
        budgetPerEmployee: body.budgetPerEmployee !== undefined ? Number(body.budgetPerEmployee) : existing.budgetPerEmployee,
        updatedAt: new Date().toISOString()
      };
      cohortsStore[index] = updated;

      json(res, 200, { cohort: updated, message: 'Cohort updated' }, headers);
      return true;
    }
  }

  return false;
}
