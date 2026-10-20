import '../testPolyfills';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallAppCard } from './InstallAppCard';
import { INSTALL_DISMISSED_KEY, resetInstallStateForTests } from '../installStore';
import { fireInstallPrompt, setStandalone, setUserAgent, UA } from '../installTestUtils';
import { notify } from '../notify';

jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const IOS = { platform: 'iPhone', maxTouchPoints: 5 };

beforeEach(() => {
  localStorage.clear();
  resetInstallStateForTests();
  setStandalone(false);
  setUserAgent(UA.androidChrome);
  (notify.success as jest.Mock).mockClear();
  (notify.warning as jest.Mock).mockClear();
  (notify.error as jest.Mock).mockClear();
});

describe('Chromium with a captured prompt', () => {
  it('shows "Install app", calls prompt() and confirms honestly when accepted', async () => {
    const e = fireInstallPrompt('accepted');
    render(<InstallAppCard variant="section" />);
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(e.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(expect.stringMatching(/Installing Wedding HQ/)));
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('when the user dismisses the browser prompt: says so, remembers 7 days, softens but keeps a way to install', async () => {
    fireInstallPrompt('dismissed');
    render(<InstallAppCard variant="section" />);
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    await waitFor(() => expect(notify.warning).toHaveBeenCalled());
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull();
    expect(screen.getByText(/Changed your mind/)).toBeInTheDocument();
    expect(screen.getByText(/Use your browser menu → Install app \/ Add to Home screen/)).toBeInTheDocument();
    // A fresh prompt later brings the button back.
    act(() => void fireInstallPrompt());
    expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  });

  it('ignores a second click while the prompt is open', async () => {
    const e = fireInstallPrompt('accepted');
    render(<InstallAppCard variant="section" />);
    const b = screen.getByRole('button', { name: 'Install app' });
    await userEvent.dblClick(b);
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('works the same on desktop Chrome', () => {
    setUserAgent(UA.desktopChrome);
    fireInstallPrompt();
    render(<InstallAppCard variant="section" />);
    expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  });
});

describe('fallback when Chromium offers no prompt', () => {
  it('section: points at the browser menu; banner: stays out of the way', () => {
    const { unmount } = render(<InstallAppCard variant="section" />);
    expect(screen.getByText('Use your browser menu → Install app / Add to Home screen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install|home screen/i })).not.toBeInTheDocument();
    unmount();
    const { container } = render(<InstallAppCard variant="banner" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('never shows once installed', () => {
  it('standalone display mode', () => {
    setStandalone(true);
    fireInstallPrompt();
    const a = render(<InstallAppCard variant="section" />);
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    expect(render(<InstallAppCard variant="banner" />).container).toBeEmptyDOMElement();
  });

  it('hides when appinstalled fires', () => {
    fireInstallPrompt();
    const { container } = render(<InstallAppCard variant="section" />);
    expect(container).not.toBeEmptyDOMElement();
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('banner', () => {
  it('can be dismissed, stays dismissed, and the More card still offers install (softened)', async () => {
    fireInstallPrompt();
    const banner = render(<InstallAppCard variant="banner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss install suggestion' }));
    expect(banner.container).toBeEmptyDOMElement();
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull();
    banner.unmount();

    expect(render(<InstallAppCard variant="banner" />).container).toBeEmptyDOMElement();
    const section = render(<InstallAppCard variant="section" />);
    expect(within(section.container).getByRole('button', { name: 'Install app' })).toBeInTheDocument();
    expect(screen.getByText(/Changed your mind/)).toBeInTheDocument();
  });

  it('is a labelled region with 44px-tall controls in the DOM order: action, then dismiss', () => {
    fireInstallPrompt();
    render(<InstallAppCard variant="banner" />);
    const region = screen.getByRole('region', { name: 'Install Wedding HQ' });
    const buttons = within(region).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Install app', '×']);
  });
});

describe('iOS Safari', () => {
  beforeEach(() => setUserAgent(UA.iphoneSafari, IOS));

  it('"Add to Home Screen" opens an accessible sheet with three numbered steps', async () => {
    render(<InstallAppCard variant="section" />);
    const open = screen.getByRole('button', { name: 'Add to Home Screen' });
    await userEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Add Wedding HQ to your Home Screen' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const steps = within(dialog).getByRole('list', { name: 'Steps to add to your Home Screen' });
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Tap the Share button');
    expect(items[1]).toHaveTextContent('Add to Home Screen');
    expect(items[2]).toHaveTextContent('Tap “Add”');
    expect(dialog.querySelectorAll('svg[aria-hidden="true"]').length).toBe(3);
    expect(within(dialog).getByText(/keeps its own copy of your data/)).toBeInTheDocument();
  });

  it('moves focus in, traps Tab, closes on Escape and returns focus to the opener', async () => {
    render(<InstallAppCard variant="section" />);
    const open = screen.getByRole('button', { name: 'Add to Home Screen' });
    await userEvent.click(open);
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const done = within(dialog).getByRole('button', { name: 'Got it' });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(done).toHaveFocus(); // wraps backwards
    await userEvent.tab();
    expect(close).toHaveFocus(); // wraps forwards
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('closes from the Got it button and the backdrop', async () => {
    render(<InstallAppCard variant="section" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    await userEvent.click(screen.getByTestId('install-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores body scrolling after closing', async () => {
    render(<InstallAppCard variant="section" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('is offered in the banner too, and dismissing it records the dismissal', async () => {
    render(<InstallAppCard variant="banner" />);
    expect(screen.getByRole('button', { name: 'Add to Home Screen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss install suggestion' }));
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull();
  });
});

describe('Chrome / Firefox on iPhone', () => {
  it('can add to the Home Screen too, and the sheet says to try Safari if the option is missing', async () => {
    setUserAgent(UA.iphoneChrome, IOS);
    render(<InstallAppCard variant="section" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    expect(screen.getByText(/Chrome and Firefox on iPhone can do this too \(iOS 16\.4 or later\)/)).toBeInTheDocument();
    expect(screen.getByText(/open this page in Safari instead/)).toBeInTheDocument();
  });
});

describe('iOS in-app browser (Instagram)', () => {
  beforeEach(() => setUserAgent(UA.iphoneInstagram, IOS));

  it('section: explains it cannot install and shows the ••• menu steps inline, with no install button', () => {
    render(<InstallAppCard variant="section" />);
    expect(screen.getByText(/can’t install Wedding HQ/)).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Steps to open in your browser' });
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Tap the ••• menu');
    expect(items[1]).toHaveTextContent('Open in Safari');
    expect(screen.queryByRole('button', { name: /Add to Home Screen|Install app/ })).not.toBeInTheDocument();
  });

  it('banner: "Show me how" opens the same steps in a sheet', async () => {
    render(<InstallAppCard variant="banner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show me how' }));
    const dialog = screen.getByRole('dialog', { name: 'Open in your browser first' });
    expect(within(dialog).getByRole('list', { name: 'Steps to open in your browser' })).toBeInTheDocument();
  });
});
