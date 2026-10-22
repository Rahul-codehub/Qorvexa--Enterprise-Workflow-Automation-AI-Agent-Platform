
// import type { RequestHandler } from 'express';

// export type UserRole = 'owner' | 'admin' | 'member';

// export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
//   return (_request, response, next) => {
//     const principal = response.locals.principal;

//     if (!principal) {
//       return response.status(401).json({
//         error: {
//           code: 'UNAUTHENTICATED',
//           message: 'Sign in is required.'
//         }
//       });
//     }

//     if (!allowedRoles.includes(principal.role as UserRole)) {
//       return response.status(403).json({
//         error: {
//           code: 'FORBIDDEN',
//           message: 'You do not have permission to perform this action.'
//         }
//       });
//     }

//     next();
//   };
// }



import type { RequestHandler } from 'express';

export type UserRole = 'owner' | 'admin' | 'member';

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (_request, response, next) => {
    const principal = response.locals.principal;

    if (!principal) {
      return response.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in is required.'
        }
      });
    }

    const role = principal.role;

    if (
      typeof role !== 'string' ||
      !['owner', 'admin', 'member'].includes(role) ||
      !allowedRoles.includes(role as UserRole)
    ) {
      return response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.'
        }
      });
    }

    next();
  };
}
