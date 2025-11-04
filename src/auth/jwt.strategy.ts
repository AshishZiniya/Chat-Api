import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev_secret',
    });
  }

  validate(payload: any) {
    // payload contains { sub: userId, username }
    const data = payload as { sub?: unknown; username?: unknown };
    if (typeof data.sub !== 'string' || typeof data.username !== 'string') {
      throw new Error('Invalid JWT payload');
    }
    return {
      userId: data.sub,
      username: data.username,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
