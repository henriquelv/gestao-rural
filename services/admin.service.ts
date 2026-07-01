import { DeviceRegistration, Farm, License } from '../types';
import { supabase } from './supabase';

export const adminService = {
  async listFarms(): Promise<Farm[]> {
    const { data, error } = await supabase.from('farms').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as Farm[];
  },

  async saveFarm(farm: Partial<Farm>): Promise<Farm> {
    const payload = {
      ...farm,
      activation_code: farm.activation_code?.trim().toUpperCase() || null,
      updated_at: new Date().toISOString()
    };

    const query = farm.id
      ? supabase.from('farms').update(payload).eq('id', farm.id)
      : supabase.from('farms').insert(payload);

    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data as Farm;
  },

  async listLicenses(farmId: string): Promise<License[]> {
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('farm_id', farmId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as License[];
  },

  async saveLicense(license: Partial<License>): Promise<License> {
    const payload = {
      ...license,
      updated_at: new Date().toISOString()
    };
    const query = license.id
      ? supabase.from('licenses').update(payload).eq('id', license.id)
      : supabase.from('licenses').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data as License;
  },

  async listDevices(farmId: string): Promise<DeviceRegistration[]> {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('farm_id', farmId)
      .order('last_seen_at', { ascending: false });
    if (error) throw error;
    return (data || []) as DeviceRegistration[];
  },

  async setDeviceStatus(id: string, status: 'active' | 'blocked'): Promise<void> {
    const { error } = await supabase
      .from('devices')
      .update({ status, last_seen_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
};
