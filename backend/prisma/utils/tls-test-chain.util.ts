import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared, short-lived certificate authority for CI TLS verification checks.
 * Everything is generated at runtime by `openssl` (available on the ubuntu
 * GitHub runners) and deleted with the temporary directory — no private keys
 * or certificates are committed to the repository.
 */

export interface TestCertificateAuthority {
  caCertPath: string;
  caKeyPath: string;
}

export interface TestServerCertificate {
  certPath: string;
  keyPath: string;
}

const openssl = (args: string[]): void => {
  execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
};

export const createTestCertificateAuthority = (
  directory: string,
  commonName = 'Inventory CI Test CA',
): TestCertificateAuthority => {
  const caKeyPath = join(directory, 'ca.key');
  const caCertPath = join(directory, 'ca.crt');
  openssl([
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-keyout', caKeyPath, '-out', caCertPath, '-days', '2',
    '-subj', `/CN=${commonName}`,
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ]);
  return { caCertPath, caKeyPath };
};

export const issueTestServerCertificate = (
  ca: TestCertificateAuthority,
  directory: string,
  tag: string,
  hostname: string,
  subjectAltName = `DNS:${hostname},IP:127.0.0.1`,
): TestServerCertificate => {
  const keyPath = join(directory, `${tag}.key`);
  const csrPath = join(directory, `${tag}.csr`);
  const certPath = join(directory, `${tag}.crt`);
  const extensionsPath = join(directory, `${tag}.ext`);

  openssl([
    'req', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-keyout', keyPath, '-out', csrPath,
    '-subj', `/CN=${hostname}`,
  ]);
  writeFileSync(
    extensionsPath,
    [
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth',
      `subjectAltName=${subjectAltName}`,
      '',
    ].join('\n'),
  );
  openssl([
    'x509', '-req', '-sha256',
    '-in', csrPath, '-CA', ca.caCertPath, '-CAkey', ca.caKeyPath,
    '-CAcreateserial', '-out', certPath, '-days', '2',
    '-extfile', extensionsPath,
  ]);
  return { certPath, keyPath };
};
