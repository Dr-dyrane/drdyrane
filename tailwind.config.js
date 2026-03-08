/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        onyx: "#000000",
        "neon-cyan": "#00F5FF",
        "neon-red": "#FF3131",
        glass: "rgba(255, 255, 255, 0.03)",
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        '25': '25px',
      },
      boxShadow: {
        'orb': '0 0 15px rgba(0, 245, 255, 0.6)',
        'orb-active': '0 0 30px rgba(0, 245, 255, 0.8)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.8)',
      }
    },
  },
  plugins: [],
}
