/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        casper: {
          red: '#FF473E',
          dark: '#1A1A2E',
          gray: '#16213E',
        },
      },
    },
  },
  plugins: [],
}
