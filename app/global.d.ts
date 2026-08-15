import {} from 'hono'

type Head = {
  title?: string
}

declare module '@hono/react-renderer' {
  interface Props {
    head?: Head
  }
}

declare module 'hono' {
  interface Env {
    Variables: {
      jwtPayload: any
    }
    Bindings: {
      DB: D1Database
      JWT_SECRET: string
    }
  }
}
