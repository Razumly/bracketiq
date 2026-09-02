import Image from 'next/image';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  belowNavigation?: boolean;
}

function LoadingSpinner({
  sizeClass,
  text,
  showLogo = false,
}: {
  sizeClass: string;
  text?: string;
  showLogo?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text ?? 'Loading'}
      className="flex flex-col items-center justify-center space-y-4"
    >
      {showLogo ? (
        <Image
          src="/BIQ_drawing.svg"
          alt="BracketIQ logo"
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-[14%]"
          priority
        />
      ) : null}
      <div
        aria-hidden="true"
        className={`${sizeClass} animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none`}
      />
      {text && (
        <p className="animate-pulse text-sm text-muted-foreground motion-reduce:animate-none">{text}</p>
      )}
    </div>
  );
}

export default function Loading({
  size = 'md',
  text,
  fullScreen = false,
  belowNavigation = false,
}: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };
  const sizeClass = sizeClasses[size];

  if (fullScreen) {
    const overlayZIndex = belowNavigation ? 'z-40' : 'z-50';

    return (
      <div className={`fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm ${overlayZIndex}`}>
        <LoadingSpinner sizeClass={sizeClass} text={text} showLogo />
      </div>
    );
  }

  return <LoadingSpinner sizeClass={sizeClass} text={text} />;
}
