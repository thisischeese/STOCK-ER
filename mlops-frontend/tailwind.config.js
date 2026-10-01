/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stibee: {
          coral: "#ff6464",
          coralHover: "#ff5252",
          ink: "#202124",
          muted: "#606165",
          caption: "#747579",
          subtle: "#9d9ea2",
          surface: "#f6f6f6",
          hairline: "#ebebeb",
          border: "#bcbdc1",
          borderFocus: "#414245",
        },
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          '"Helvetica Neue"',
          '"Segoe UI"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Malgun Gothic"',
          'sans-serif',
        ],
      },
      borderRadius: {
        DEFAULT: "4px",
        stibee: "4px",
      },
    },
  },
  plugins: [],
}
