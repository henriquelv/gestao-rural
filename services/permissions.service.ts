import { Anomaly, AppActivationContext, Appointment, Employee } from '../types';
import { farmContextService } from './farm-context.service';

const normalized = (value?: string) => (value || '').trim().toLocaleLowerCase('pt-BR');
const ADMIN_ROLE = 'administrador';

export const permissionsService = {
  isAdmin(context: AppActivationContext | null = farmContextService.getContext()): boolean {
    const role = normalized(context?.employee_role);
    return context?.is_owner === true
      || role === ADMIN_ROLE
      || (context?.is_admin === true && !role);
  },

  isPrivilegedEmployee(employee?: Pick<Employee, 'role' | 'is_admin'> | null): boolean {
    const role = normalized(employee?.role);
    return role === ADMIN_ROLE || (employee?.is_admin === true && !role);
  },

  isWorkOrderCreator(
    workOrder: Anomaly,
    context: AppActivationContext | null = farmContextService.getContext()
  ): boolean {
    if (!context) return false;
    const creatorId = String(workOrder.createdByEmployeeId || workOrder.employee_id || '');
    if (creatorId && creatorId === String(context.employee_id)) return true;

    const creatorName = workOrder.createdByEmployeeName
      || workOrder.employee_name
      || workOrder.responsible;
    return normalized(creatorName) === normalized(context.employee_name);
  },

  canViewWorkOrderValues(
    workOrder: Anomaly,
    context: AppActivationContext | null = farmContextService.getContext()
  ): boolean {
    return this.isAdmin(context) || this.isWorkOrderCreator(workOrder, context);
  },

  canAccessWorkOrder(
    workOrder: Anomaly,
    context: AppActivationContext | null = farmContextService.getContext()
  ): boolean {
    return this.isAdmin(context) || this.isWorkOrderCreator(workOrder, context);
  },

  canAccessAppointment(
    appointment: Appointment,
    context: AppActivationContext | null = farmContextService.getContext()
  ): boolean {
    if (this.isAdmin(context)) return true;
    if (!context) return false;
    if (String(appointment.employee_id || '') === String(context.employee_id)) return true;
    return normalized(appointment.employee_name) === normalized(context.employee_name);
  }
};
