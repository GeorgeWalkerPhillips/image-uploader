import { toast } from 'react-toastify';
import styles from './wedding.module.css';

// HQ toasts sit at the top so they never cover a Save button on a phone.
const options = { position: 'top-center', className: styles.hqToast } as const;

export const notify = {
  success: (message: string) => toast.success(message, options),
  error: (message: string) => toast.error(message, options),
  warning: (message: string) => toast.warning(message, { ...options, autoClose: 9000 }),
};
