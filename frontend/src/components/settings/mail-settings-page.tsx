import { ArrowLeft, Mail, RotateCcw, Save, Send, Server, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchEmailLogsApi,
  fetchEmailTemplatesApi,
  fetchMailConfigApi,
  previewEmailTemplateApi,
  resetEmailTemplateApi,
  sendTestEmailApi,
  saveMailConfigApi,
  testMailConnectionApi,
  updateEmailTemplateApi,
  type EmailLogDto,
  type EmailTemplateDto,
  type MailProviderId,
} from '../../api/mail-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { cardClass, inputClass } from '../ui/form-styles';
import { PageHeader } from '../ui/page-header';
import {
  applyProviderPreset,
  insertVariableToken,
  toMailConfigFormState,
  validateRecipientFields,
  type MailConfigFormState,
} from './mail-form.util';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export const MailSettingsPage = () => {
  const navigate = useNavigate();
  const { toastSuccess, toastError } = useToast();

  const [form, setForm] = useState<MailConfigFormState | null>(null);
  const [presets, setPresets] = useState<MailConfigDtoPresets>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const [templates, setTemplates] = useState<EmailTemplateDto[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(
    null,
  );
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [logs, setLogs] = useState<EmailLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [config, templateRows, logRows] = await Promise.all([
        fetchMailConfigApi(),
        fetchEmailTemplatesApi(),
        fetchEmailLogsApi(50),
      ]);
      setForm(toMailConfigFormState(config));
      setPresets(config.presets);
      setTemplates(templateRows);
      setSelectedKey((current) =>
        templateRows.some((row) => row.key === current)
          ? current
          : (templateRows[0]?.key ?? ''),
      );
      setLogs(logRows);
    } catch (error) {
      toastError(errorMessage(error, 'Greška pri učitavanju postavki e-pošte'));
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedTemplate = useMemo(
    () => templates.find((row) => row.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const patchForm = (patch: Partial<MailConfigFormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  const patchTemplate = (patch: Partial<EmailTemplateDto>) =>
    setTemplates((current) =>
      current.map((row) => (row.key === selectedKey ? { ...row, ...patch } : row)),
    );

  const handleProviderChange = (provider: MailProviderId) => {
    setForm((current) => (current ? applyProviderPreset(current, provider, presets) : current));
  };

  const handleSaveConfig = async () => {
    if (!form) return;
    setSavingConfig(true);
    try {
      const saved = await saveMailConfigApi({
        enabled: form.enabled,
        provider: form.provider,
        host: form.host,
        port: form.port,
        secure: form.secure,
        username: form.username,
        password: form.password || undefined,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
      });
      setForm(toMailConfigFormState(saved));
      setPresets(saved.presets);
      toastSuccess('SMTP konfiguracija je sačuvana.');
    } catch (error) {
      toastError(errorMessage(error, 'Greška pri čuvanju SMTP konfiguracije'));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await testMailConnectionApi();
      toastSuccess(result.message);
    } catch (error) {
      toastError(errorMessage(error, 'Povezivanje na SMTP server nije uspjelo'));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTest = async () => {
    const validation = validateRecipientFields({ to: testRecipient });
    if (validation) {
      toastError(validation);
      return;
    }
    setSendingTest(true);
    try {
      await sendTestEmailApi(testRecipient.trim());
      toastSuccess(`Testni email je poslan na ${testRecipient.trim()}.`);
      const logRows = await fetchEmailLogsApi(50);
      setLogs(logRows);
    } catch (error) {
      toastError(errorMessage(error, 'Slanje testnog emaila nije uspjelo'));
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    setSavingTemplate(true);
    try {
      const saved = await updateEmailTemplateApi(selectedTemplate.key, {
        name: selectedTemplate.name,
        description: selectedTemplate.description ?? undefined,
        subject: selectedTemplate.subject,
        bodyHtml: selectedTemplate.bodyHtml,
        bodyText: selectedTemplate.bodyText,
        enabled: selectedTemplate.enabled,
      });
      setTemplates((current) => current.map((row) => (row.key === saved.key ? saved : row)));
      toastSuccess('Template je sačuvan.');
    } catch (error) {
      toastError(errorMessage(error, 'Greška pri čuvanju template-a'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleResetTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      const reset = await resetEmailTemplateApi(selectedTemplate.key);
      setTemplates((current) => current.map((row) => (row.key === reset.key ? reset : row)));
      setPreview(null);
      toastSuccess('Template je vraćen na zadanu (default) verziju.');
    } catch (error) {
      toastError(errorMessage(error, 'Greška pri resetovanju template-a'));
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;
    setLoadingPreview(true);
    try {
      const result = await previewEmailTemplateApi(selectedTemplate.key, {
        subject: selectedTemplate.subject,
        bodyHtml: selectedTemplate.bodyHtml,
        bodyText: selectedTemplate.bodyText,
      });
      setPreview(result);
    } catch (error) {
      toastError(errorMessage(error, 'Greška pri generisanju pregleda'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const activePreset = presets.find((preset) => preset.id === form?.provider);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
      >
        <ArrowLeft size={14} /> Nazad na postavke
      </button>
      <PageHeader
        title="E-pošta (SMTP)"
        description="SMTP server, email template-i i dnevnik slanja"
      />

      {isLoading || !form ? (
        <p className="text-sm text-gray-500">Učitavanje…</p>
      ) : (
        <>
          {/* SMTP konfiguracija */}
          <section className={`${cardClass} space-y-4 p-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Server size={16} /> SMTP konfiguracija
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleProviderChange(preset.id)}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    form.provider === preset.id
                      ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className="block font-medium text-gray-900">{preset.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{preset.description}</span>
                  {preset.id !== 'custom' ? (
                    <span className="mt-2 block font-mono text-xs text-gray-600">
                      {preset.host}:{preset.port} ({preset.secure ? 'SSL/TLS' : 'STARTTLS'})
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => patchForm({ enabled: event.target.checked })}
              />
              Slanje emaila je omogućeno
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              {form.provider === 'custom' ? (
                <>
                  <label className="text-xs text-gray-600">
                    SMTP host
                    <input
                      className={`${inputClass} mt-1`}
                      value={form.host}
                      onChange={(event) => patchForm({ host: event.target.value })}
                      placeholder="mail.firma.ba"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Port
                    <input
                      className={`${inputClass} mt-1`}
                      type="number"
                      min={1}
                      max={65535}
                      value={form.port}
                      onChange={(event) => patchForm({ port: Number(event.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.secure}
                      onChange={(event) => patchForm({ secure: event.target.checked })}
                    />
                    Implicit TLS (SSL, obično port 465) — bez toga se koristi STARTTLS
                  </label>
                </>
              ) : (
                <p className="text-xs text-gray-500 md:col-span-2">
                  Host, port i enkripcija su zaključani na {activePreset?.label} preset:{' '}
                  <span className="font-mono">
                    {activePreset?.host}:{activePreset?.port} (
                    {activePreset?.secure ? 'SSL/TLS' : 'STARTTLS'})
                  </span>
                </p>
              )}

              <label className="text-xs text-gray-600">
                Korisničko ime
                <input
                  className={`${inputClass} mt-1`}
                  value={form.username}
                  onChange={(event) => patchForm({ username: event.target.value })}
                  placeholder="evidencija@firma.ba"
                />
                {activePreset ? (
                  <span className="mt-1 block text-[11px] text-gray-400">
                    {activePreset.usernameHint}
                  </span>
                ) : null}
              </label>
              <label className="text-xs text-gray-600">
                Lozinka {form.hasPassword ? '(sačuvana — ostavite prazno da je zadržite)' : ''}
                <input
                  className={`${inputClass} mt-1`}
                  type="password"
                  value={form.password}
                  onChange={(event) => patchForm({ password: event.target.value })}
                  placeholder={form.hasPassword ? '••••••••' : ''}
                  autoComplete="new-password"
                />
                {activePreset ? (
                  <span className="mt-1 block text-[11px] text-gray-400">
                    {activePreset.passwordHint}
                  </span>
                ) : null}
              </label>
              <label className="text-xs text-gray-600">
                „Od" email adresa (From)
                <input
                  className={`${inputClass} mt-1`}
                  value={form.fromEmail}
                  onChange={(event) => patchForm({ fromEmail: event.target.value })}
                  placeholder="evidencija@firma.ba"
                />
              </label>
              <label className="text-xs text-gray-600">
                „Od" naziv (From name)
                <input
                  className={`${inputClass} mt-1`}
                  value={form.fromName}
                  onChange={(event) => patchForm({ fromName: event.target.value })}
                  placeholder="Evidens — evidencija opreme"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveConfig()}
                disabled={savingConfig}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={14} /> {savingConfig ? 'Čuvanje…' : 'Sačuvaj konfiguraciju'}
              </button>
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testingConnection}
                className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                <Server size={14} /> {testingConnection ? 'Testiranje…' : 'Testiraj vezu'}
              </button>
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} w-56`}
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder="test@firma.ba"
                />
                <button
                  type="button"
                  onClick={() => void handleSendTest()}
                  disabled={sendingTest}
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  <Send size={14} /> {sendingTest ? 'Slanje…' : 'Pošalji testni email'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Test veze i testni email koriste posljednju sačuvanu konfiguraciju. Lozinka se na
              serveru čuva šifrovano i nikada se ne prikazuje.
            </p>
          </section>

          {/* Email template-i */}
          <section className={`${cardClass} space-y-4 p-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Mail size={16} /> Email template-i
            </div>
            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => {
                      setSelectedKey(template.key);
                      setPreview(null);
                    }}
                    className={`w-full rounded-lg border p-3 text-left text-sm ${
                      template.key === selectedKey
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-medium text-gray-900">{template.name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-gray-400">
                      {template.key}
                    </span>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${
                        template.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {template.enabled ? 'Uključen' : 'Isključen'}
                    </span>
                  </button>
                ))}
              </div>

              {selectedTemplate ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-gray-600">
                      Naziv template-a
                      <input
                        className={`${inputClass} mt-1`}
                        value={selectedTemplate.name}
                        onChange={(event) => patchTemplate({ name: event.target.value })}
                      />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedTemplate.enabled}
                        onChange={(event) => patchTemplate({ enabled: event.target.checked })}
                      />
                      Template je uključen
                    </label>
                  </div>
                  <label className="block text-xs text-gray-600">
                    Opis
                    <input
                      className={`${inputClass} mt-1`}
                      value={selectedTemplate.description ?? ''}
                      onChange={(event) => patchTemplate({ description: event.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Naslov (subject)
                    <input
                      className={`${inputClass} mt-1`}
                      value={selectedTemplate.subject}
                      onChange={(event) => patchTemplate({ subject: event.target.value })}
                    />
                  </label>

                  <div>
                    <span className="text-xs text-gray-600">Dostupne varijable (klik ubacuje u HTML tijelo):</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedTemplate.variables.map((variable) => (
                        <button
                          key={variable.name}
                          type="button"
                          title={variable.description}
                          onClick={() =>
                            patchTemplate({
                              bodyHtml: insertVariableToken(
                                selectedTemplate.bodyHtml,
                                variable.name,
                              ),
                            })
                          }
                          className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-blue-100"
                        >
                          {`{{${variable.name}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block text-xs text-gray-600">
                    Tijelo — HTML
                    <textarea
                      className={`${inputClass} mt-1 min-h-40 font-mono text-xs`}
                      value={selectedTemplate.bodyHtml}
                      onChange={(event) => patchTemplate({ bodyHtml: event.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Tijelo — čisti tekst (fallback)
                    <textarea
                      className={`${inputClass} mt-1 min-h-32 font-mono text-xs`}
                      value={selectedTemplate.bodyText}
                      onChange={(event) => patchTemplate({ bodyText: event.target.value })}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveTemplate()}
                      disabled={savingTemplate}
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={14} /> {savingTemplate ? 'Čuvanje…' : 'Sačuvaj template'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePreview()}
                      disabled={loadingPreview}
                      className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Wand2 size={14} /> {loadingPreview ? 'Generisanje…' : 'Pregled (ogledni podaci)'}
                    </button>
                    {selectedTemplate.isSystem ? (
                      <button
                        type="button"
                        onClick={() => void handleResetTemplate()}
                        className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                      >
                        <RotateCcw size={14} /> Vrati zadani template
                      </button>
                    ) : null}
                  </div>

                  {preview ? (
                    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">
                        <strong>Naslov:</strong> {preview.subject}
                      </p>
                      <iframe
                        title="Pregled email template-a"
                        srcDoc={preview.html}
                        className="h-64 w-full rounded border border-gray-200 bg-white"
                      />
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                        {preview.text}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nema template-a.</p>
              )}
            </div>
          </section>

          {/* Dnevnik slanja */}
          <section className={`${cardClass} space-y-3 p-4`}>
            <div className="text-sm font-semibold text-gray-800">Dnevnik slanja</div>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500">Još nije poslan nijedan email.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="py-2 pr-2">Vrijeme</th>
                      <th className="py-2 pr-2">Primaoci</th>
                      <th className="py-2 pr-2">Naslov</th>
                      <th className="py-2 pr-2">Template</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('bs-BA')}
                        </td>
                        <td className="py-2 pr-2">{log.toAddresses}</td>
                        <td className="py-2 pr-2">{log.subject}</td>
                        <td className="py-2 pr-2 font-mono text-[11px]">{log.templateKey ?? '—'}</td>
                        <td className="py-2">
                          {log.status === 'sent' ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                              Poslano
                            </span>
                          ) : (
                            <span
                              className="rounded-full bg-red-100 px-2 py-0.5 text-red-800"
                              title={log.error ?? ''}
                            >
                              Neuspjelo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

type MailConfigDtoPresets = Awaited<ReturnType<typeof fetchMailConfigApi>>['presets'];
