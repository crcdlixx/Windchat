/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        wind: {
          50:  'rgb(var(--wind-50) / <alpha-value>)',
          100: 'rgb(var(--wind-100) / <alpha-value>)',
          200: 'rgb(var(--wind-200) / <alpha-value>)',
          300: 'rgb(var(--wind-300) / <alpha-value>)',
          400: 'rgb(var(--wind-400) / <alpha-value>)',
          500: 'rgb(var(--wind-500) / <alpha-value>)',
          600: 'rgb(var(--wind-600) / <alpha-value>)',
          700: 'rgb(var(--wind-700) / <alpha-value>)',
          800: 'rgb(var(--wind-800) / <alpha-value>)',
          900: 'rgb(var(--wind-900) / <alpha-value>)',
          950: 'rgb(var(--wind-950) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
