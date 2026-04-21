#!/usr/bin/env python3

import argparse
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description='Serve this Tableau extension over local HTTPS.')
    parser.add_argument('--host', default='localhost')
    parser.add_argument('--port', type=int, default=8443)
    parser.add_argument('--cert', default='certs/localhost.pem')
    parser.add_argument('--key', default='certs/localhost-key.pem')
    args = parser.parse_args()

    cert_path = Path(args.cert)
    key_path = Path(args.key)
    if not cert_path.exists() or not key_path.exists():
        raise SystemExit(
            'Missing HTTPS certificate files.\n'
            f'Expected cert: {cert_path}\n'
            f'Expected key:  {key_path}\n'
            'Create them with mkcert or openssl, then run this command again.'
        )

    server = ThreadingHTTPServer((args.host, args.port), NoCacheHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f'Serving HTTPS on https://{args.host}:{args.port}/')
    print('Press Ctrl+C to stop.')
    server.serve_forever()


if __name__ == '__main__':
    main()
