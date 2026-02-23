
export type ToastType = 'success' | 'error' | 'info';

export const notify = (message: string, type: ToastType = 'success') => {
  const event = new CustomEvent('app-toast', { 
    detail: { message, type } 
  });
  window.dispatchEvent(event);
};
