import { NextFunction, Request, Response } from "express"

type AuthenticatedRequest = Request & {
    user?: {
        id?: string
        email?: string
    }
}

export const requestLogger = (
    _req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
) => {
    next()
}
