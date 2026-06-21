import mjwLogo from "@/assets/mjw-logo.png.asset.json";

export function MjwLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={mjwLogo.url}
      alt="MJW"
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export const MJW_LOGO_URL = mjwLogo.url;