import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-admin-api-key'];
    
    // Check against allowed keys from environment
    const validKeys = process.env.ADMIN_API_KEYS?.split(',') || [];
    
    if (!apiKey || !validKeys.includes(apiKey)) {
      throw new UnauthorizedException('Invalid API key');
    }
    
    // Attach API key info to request for logging
    request.apiKey = apiKey;
    return true;
  }
}
