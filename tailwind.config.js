/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F8F7',
        ink: {
          DEFAULT: '#0B1F1E',
          50: '#EFF4F3',
          100: '#D8E4E2',
          300: '#8AA6A2',
          500: '#3E5D59',
          700: '#17302E',
          900: '#0B1F1E',
        },
        brand: {
          50: '#EAF6F4',
          100: '#CDEBE6',
          200: '#9CD7CD',
          300: '#63BDAF',
          400: '#349D8E',
          500: '#0F7A72',
          600: '#0C645E',
          700: '#0A504B',
          800: '#083F3B',
          900: '#062B28',
        },
        pulse: {
          DEFAULT: '#2EE6B8',
          soft: '#B8F7E7',
          dim: '#0F7A72',
        },
        coral: {
          DEFAULT: '#FF5C4D',
          soft: '#FFE1DC',
          dim: '#C43C2F',
        },
        gold: {
          DEFAULT: '#F2A93B',
          soft: '#FDECCC',
          dim: '#B9791F',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,31,30,0.04), 0 8px 24px -12px rgba(11,31,30,0.12)',
        panel: '0 20px 60px -20px rgba(8,63,59,0.45)',
      },
      keyframes: {
        pulseline: {
          '0%': { strokeDashoffset: '240' },
          '100%': { strokeDashoffset: '0' },
        },
        popIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        pulseline: 'pulseline 2.4s linear infinite',
        popIn: 'popIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
