// app/robots.ts — robots.txt (served at /robots.txt)

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/auth/'],
      },
    ],
    sitemap: 'https://www.gradewithkatana.com/sitemap.xml',
  };
}
