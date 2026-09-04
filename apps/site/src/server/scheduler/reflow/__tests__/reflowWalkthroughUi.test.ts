/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, waitFor } from '@testing-library/dom';
import { runReflowDemo, type DemoScenario } from '../../prototypes/reflow-flow/demo';
import type { ReflowInput } from '../types';

test('the walkthrough displays computed assignment-only changes and an unchanged-state failure', async () => {
  const html = readFileSync(join(process.cwd(), 'src/server/scheduler/prototypes/reflow-flow/index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error('The walkthrough script is missing.');
  const originalFetch = window.fetch;
  const errors: unknown[] = [];
  window.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { scenario: DemoScenario; fieldPolicy: ReflowInput['fieldPolicy'] };
    return { ok: true, json: async () => runReflowDemo(request.scenario, request.fieldPolicy) } as Response;
  });
  const onError = (event: ErrorEvent) => { errors.push(event.error); };
  window.addEventListener('error', onError);
  try {
    document.documentElement.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, '');
    window.eval(script);
    const run = document.getElementById('run') as HTMLButtonElement;
    const scenario = document.getElementById('scenario') as HTMLSelectElement;
    await waitFor(() => expect(run.disabled).toBe(false));
    fireEvent.change(scenario, { target: { value: 'swap' } });
    await waitFor(() => expect(run.disabled).toBe(false));
    fireEvent.click(run);
    expect(document.getElementById('status')?.textContent).toContain('0 placement change(s), 2 assignment change(s)');
    expect(document.querySelector('#M5 .duty')?.textContent).toBe('Team Duty: Pine');
    expect(document.querySelector('#M6 .duty')?.textContent).toBe('Team Duty: Falcon');
    expect(document.querySelector('#M6 .entrant')?.textContent).toContain('Winner of Match 3: Metro');
    fireEvent.change(scenario, { target: { value: 'fields' } });
    await waitFor(() => expect(run.disabled).toBe(false));
    fireEvent.click(run);
    expect(document.getElementById('status')?.textContent).toContain('INFEASIBLE');
    expect(document.querySelectorAll('.match.changed')).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    window.fetch = originalFetch;
    window.removeEventListener('error', onError);
  }
});
