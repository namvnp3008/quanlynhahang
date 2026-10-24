/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#DC2626',
          'primary-hover': '#B91C1C',
          'primary-light': '#FEF2F2',
          'chip-active': '#B91C1C',
        },
        kds: {
          'bg-base': '#0F172A',
          'bg-card': '#020617',
          'text-title': '#FFFFFF',
          'text-body': '#CBD5E1',
          'text-muted': '#94A3B8',
          'status-pending': '#FBBF24',
          'status-cooking': '#60A5FA',
          'status-done': '#4ADE80',
          'status-alert': '#F87171',
        },
        status: {
          'success-text': '#15803D',
          'success-bg': '#F0FDF4',
          'warning-text': '#C2410C',
          'warning-bg': '#FFF7ED',
          'amber-text': '#B45309',
          'amber-bg': '#FFFBEB',
          'danger-text': '#B91C1C',
          'danger-bg': '#FEF2F2',
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
