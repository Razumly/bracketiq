import { toast } from 'sonner';

type OrganizationNotificationOptions = {
  message: string | number;
  title?: string;
  color?: string;
  autoClose?: number | false;
};

const duration = (autoClose: number | false | undefined): number | undefined => (
  autoClose === false ? Infinity : autoClose
);

export const notifications = {
  show({ message, title, color, autoClose }: OrganizationNotificationOptions) {
    const content = title ? `${title}: ${message}` : String(message);
    const options = { duration: duration(autoClose) };
    if (color === 'red') {
      toast.error(content, options);
      return;
    }
    if (color === 'yellow' || color === 'orange') {
      toast.warning(content, options);
      return;
    }
    if (color === 'green' || color === 'teal') {
      toast.success(content, options);
      return;
    }
    toast.info(content, options);
  },
};
