/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#fdfbf7',
        surface: '#ffffff',
        'surface-raised': '#fef2f2',
        border: '#fca5a5',
        'border-subtle': '#fee2e2',
        primary: '#450a0a',
        secondary: '#991b1b',
        muted: '#f87171',
        accent: {
          purple: '#ef4444',
          teal: '#f43f5e',
          blue: '#dc2626',
          orange: '#ea580c',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
