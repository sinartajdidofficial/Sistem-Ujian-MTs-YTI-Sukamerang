/**
 * Logo madrasah. Berkas aslinya di `public/logo.png`, jadi dipakai dengan
 * alamat tetap `/logo.png` dan ikut terbawa saat situs dibangun.
 */
type LogoProps = {
  /** sisi gambar dalam piksel (kotak) */
  size?: number;
  className?: string;
  alt?: string;
};

export function Logo({ size = 32, className = "", alt = "Logo MTs YTI Sukamerang" }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none object-contain ${className}`}
    />
  );
}
