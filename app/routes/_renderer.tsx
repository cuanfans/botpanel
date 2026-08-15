import { jsxRenderer } from 'hono/jsx-renderer'

export default jsxRenderer(({ children, title }) => {
  return (
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} | Panel Bot` : 'Panel Admin Bot'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          {`
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    primary: '#0d5fa3',
                    secondary: '#1d8eed'
                  }
                }
              }
            }
          `}
        </script>
      </head>
      <body class="bg-gray-50 text-gray-800 antialiased">
        <div class="min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  )
})
