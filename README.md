# YouTube Focus

[简体中文](README.zh-CN.md)

A lightweight Chrome extension that hides distracting elements in YouTube's top
bar and brings them back with a single shortcut. More restrained than Unhook —
it only touches the elements you asked for, nothing else.

Hiding applies **only on the watch page** (`youtube.com/watch`). Browse pages
(home, search, channel, subscriptions, …) are left completely untouched.

## Hides

Top bar:

- Menu (hamburger) button, top-left
- Top-left YouTube logo
- Top search bar (incl. voice-search button)
- Create button
- Notifications bell
- User avatar
- The **Tags** button injected by the PocketTube extension

Below the video:

- Channel owner block (avatar, channel name, subscriber count)
- Subscribe button
- The **Add to group** button injected by the PocketTube extension
- The whole action row (Like, Dislike, Share, Ask, Save, More)
- The right-hand recommended/related sidebar (incl. live chat)
- Comments

The video description is **collapsed by default**; a small "Show description"
button (injected under the title) expands it fully in one click. That open/closed
state is remembered across videos and tabs, just like focus mode.

## Keeps

Video title (and the description, one click away).

## Usage

- Default shortcut **Alt+Shift+F** (on Mac, Alt = Option), or click the toolbar
  icon, to toggle.
- State is remembered: it persists across tabs and browser restarts, restoring
  whatever the last on/off state was.

## Install (developer mode, no build step)

1. Open `chrome://extensions` and turn on "Developer mode" (top right).
2. Click "Load unpacked" and select this folder.
3. Open YouTube and press `Alt+Shift+F`.
4. To rebind the shortcut: `chrome://extensions/shortcuts`.

## After editing the code

Click the ↻ reload button on the extension card, then refresh the YouTube tab.

## An element isn't hidden?

YouTube most likely changed its DOM. Adjust the selector in `src/hide.css`
first. If it's the PocketTube Tags button that isn't being hidden, right-click
and inspect it, then share its class — it can be swapped for a precise selector.
