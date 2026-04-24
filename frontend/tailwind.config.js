/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        earth: {
          bg:     '#FAF7F0', // warm white — main background
          card:   '#F0E5D0', // cream — cards / surfaces
          input:  '#E3D0B8', // light tan — inputs
          border: '#C8A882', // medium tan — borders
          text:   '#1C0F00', // near-black — primary text
          body:   '#3A2010', // dark brown — body text
          muted:  '#6B4530', // medium brown — secondary text
          faint:  '#9A7A5A', // warm taupe — placeholders / very muted
        },
        brand: {
          50:  '#FDF0E8',
          500: '#8B4513', // terracotta
          600: '#6B3410',
          700: '#4F260C',
        },
      },
    },
  },
  plugins: [],
}
