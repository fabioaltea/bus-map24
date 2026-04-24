import type { FastifyPluginAsync } from 'fastify'

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { password: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      if (request.body.password !== process.env.ADMIN_PASSWORD) {
        return reply.status(401).send({
          type: '/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid password',
        })
      }
      const token = app.jwt.sign({ role: 'admin' }, { expiresIn: '24h' })
      return { token }
    },
  )
}

export default authRoutes
