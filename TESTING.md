# TESTING.md

Five minutes, on your own phone, before you trust a change to the live table, the
filters, or the motion. Concrete steps, pass/fail each. Do it in Hebrew, in the dark,
one-handed -- that is the app's actual condition of use.

## 1. First paint, no jump

1. Force-quit the browser/PWA so nothing is warm, then open a game you are seated in
   from a cold tap (icon or a WhatsApp link). **Pass:** the table, the header and the
   bottom action bar are where they end up on the very first frame you can see --
   nothing you were about to tap slides out from under your thumb a moment later.
   **Fail:** you see the table (or a "table not loaded" message) flash and then get
   replaced by the real one.
2. With that game still open and active, switch to "היסטוריה" or "החבורה" from the
   tab bar. **Pass:** no navbar jump, no flash of the wrong header height.

## 2. Nothing overlapping or unreachable at 390px

1. On the live table with 6+ opponents seated, confirm every seat's name and amount
   is fully readable and every avatar is tappable (not clipped by a neighbour).
2. Open every sheet from the table's "⋯" (more actions): history, invite, watch link,
   attach/leave a shared seat, and (host) hand rankings / odds if mounted. **Pass:**
   each opens fully on screen, its own close/cancel button is reachable with one thumb,
   and the keyboard (where a sheet has a text field) does not sit on top of the field
   you just opened it for -- the field stays visible above the keyboard.
3. Tap every control on the table and in the bottom nav bar with a thumb, not a
   fingertip. **Pass:** nothing feels smaller than a fingertip, nothing mis-taps its
   neighbour.

## 3. Filters and search, one-handed

1. On "היסטוריה" with at least two closed games, tap the filter button (the sliders
   icon beside search). **Pass:** it opens a bottom sheet, not a row of controls
   crowding the list; the sheet's own scroll (if the location list is long) does not
   trap the page underneath it.
2. Set a date range and apply it. **Pass:** the filter button now shows a small count
   badge, and the button itself looks visibly "on" (a filled pill, not only new text)
   -- so a short filtered list still reads as filtered, not as "history is empty."
3. Tap "נקו סינון" inside the sheet. **Pass:** every filter clears and the badge
   disappears in one tap, no need to open the date pickers individually to blank them.
4. On "החבורה," type a few letters into the player search, then tap the small "×"
   inside the field. **Pass:** the field clears in one tap and the full roster returns
   immediately -- you did not have to hold backspace.

## 4. Motion doesn't delay a tap

1. Rebuy for yourself twice in a row, fast. **Pass:** both taps register immediately;
   the pot and your own total update without waiting for an animation to finish, and
   the amount that just changed gives a small confirming pulse rather than snapping.
2. During chip counting (cash-out), tap "סיימתי לספור." **Pass:** the "סיימו לספור"
   confirmation appears with a small settle, not a hard snap, and the button under
   your thumb responds the instant you lift it -- nothing waits for the settle to
   finish.
3. Reach the settlement screen for a real game (or a solo test game) and tap anywhere
   on it while the celebration is still running. **Pass:** the whole sequence -- pot,
   winner, crown, every player row, every transfer row -- jumps straight to its final
   state on that one tap. Nothing keeps counting or sliding in afterward.
4. Turn on "צמצום תנועה" (reduce motion) in your profile and repeat steps 1-3.
   **Pass:** everything above still happens, just without the travel -- a plain
   opacity change, no delay either way.

## 5. The full night, join code to WhatsApp summary

1. Open a table, copy the room code, and have a second phone (or a private window)
   join with it, choose a seat and enter it.
2. Both phones rebuy at least once. **Pass:** the pot and both seats update on both
   phones within a few seconds without either phone reloading.
3. Host ends the night for everyone, both seats count their chips, host closes the
   book. **Pass:** the settlement math is legible before you check it against a
   napkin, and the transfer list is right (who pays whom).
4. Tap "שתפו את הסיכום." **Pass:** the share sheet (or a copied image/text) is legible,
   correctly attributes any shared seat's members, and the app never asked you to
   trust a number you could not also see on screen first.
