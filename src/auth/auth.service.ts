import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async login(username: string, password: string) {
    type LeanUser = {
      _id: unknown;
      username: unknown;
      passwordHash?: unknown;
      avatar?: unknown;
    } | null;

    const user = (await this.usersService.findByUsername(username)) as LeanUser;

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Validate passwordHash exists and is a string
    if (typeof user.passwordHash !== 'string') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // Safely stringify _id: prefer calling toString() if present, otherwise
    // fall back to String(). This avoids using Object's default toString on
    // plain objects.
    let idString: string;
    if (
      user._id !== null &&
      typeof user._id === 'object' &&
      typeof (user._id as { toString?: unknown }).toString === 'function'
    ) {
      // toString exists, call it and coerce to string
      idString = String((user._id as { toString: () => unknown }).toString());
    } else {
      idString = String(user._id);
    }

    await this.usersService.setOnline(idString, true);

    // Validate username is a string before including it in the token
    const usernameStr = typeof user.username === 'string' ? user.username : '';

    const accessToken = jwt.sign(
      { sub: idString, username: usernameStr },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      { sub: idString },
      process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      { expiresIn: '7d' },
    );

    // Store refresh token hash in database
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(idString, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      user: { _id: idString, username: usernameStr, avatar: user.avatar },
    };
  }
  async register(username: string, password: string, avatar?: string) {
    // Validate input
    if (!username || !password) {
      throw new BadRequestException('Username and password are required');
    }
    if (username.length < 3) {
      throw new BadRequestException(
        'Username must be at least 3 characters long',
      );
    }
    if (password.length < 6) {
      throw new BadRequestException(
        'Password must be at least 6 characters long',
      );
    }
    // Check if user exists
    const existing = await this.usersService.findByUsername(username);
    if (existing) {
      throw new BadRequestException('Username already taken');
    }
    // Create user
    const user = await this.usersService.create(username, password, avatar);
    // Safely stringify _id
    let idString: string;
    if (
      user._id !== null &&
      typeof user._id === 'object' &&
      typeof (user._id as { toString?: unknown }).toString === 'function'
    ) {
      idString = String((user._id as { toString: () => unknown }).toString());
    } else {
      idString = String(user._id);
    }
    const accessToken = jwt.sign(
      { sub: idString, username: user.username },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      { sub: idString },
      process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      { expiresIn: '7d' },
    );

    // Store refresh token hash in database
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(idString, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      user: { _id: idString, username: user.username, avatar: user.avatar },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      ) as { sub: string };

      const userId = payload.sub;
      const isValid = await this.usersService.validateRefreshToken(
        userId,
        refreshToken,
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newAccessToken = jwt.sign(
        { sub: userId, username: user.username },
        process.env.JWT_SECRET || 'dev_secret',
        { expiresIn: '15m' },
      );

      const newRefreshToken = jwt.sign(
        { sub: userId },
        process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
        { expiresIn: '7d' },
      );

      // Update refresh token in database
      const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
      await this.usersService.updateRefreshToken(userId, newRefreshTokenHash);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.usersService.removeRefreshToken(userId);
  }
}
