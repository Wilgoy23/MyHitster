import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import qrcode
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
import os
import base64
import hashlib
import requests
from io import BytesIO
import datetime

# Replace with your Spotify API credentials
SPOTIPY_CLIENT_ID = "YOUR_CLIENT_ID_HERE"
SPOTIPY_CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE"

# Your GitHub Pages URL
HITSTER_URL = "https://wilgoy23.github.io/MyHitster" # Update this to your actual GitHub Pages URL

# Authenticate with Spotify API
sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=SPOTIPY_CLIENT_ID,
                                                           client_secret=SPOTIPY_CLIENT_SECRET))


def format_release_date(release_date):
    """Extract only the year from the release date."""
    if not release_date:
        return "Unknown"

    try:
        if len(release_date) >= 4:
            year = release_date[:4]
            if year.isdigit() and 1900 <= int(year) <= datetime.datetime.now().year:
                return year
    except ValueError:
        pass

    return "Unknown"


def sanitize_filename(filename):
    return "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in filename)


def create_obfuscated_url(track_url):
    """Creates an obfuscated URL that links to our custom player."""
    # Extract track ID from the URL
    track_id = track_url.split('/')[-1].split('?')[0]

    # Create a Spotify URI which will be used for playback
    spotify_uri = f"spotify:track:{track_id}"

    # Base64 encode the Spotify URI to hide it
    encoded_uri = base64.urlsafe_b64encode(spotify_uri.encode()).decode()

    # Create a hash for a unique URL
    hash_object = hashlib.sha256(track_url.encode())
    hex_digest = hash_object.hexdigest()[:12]

    # Create URL for GitHub Pages site
    obfuscated_url = f"{HITSTER_URL}/index.html?id={hex_digest}&track={encoded_uri}"

    return obfuscated_url


def generate_qr_code(track_url, output_path):
    """Generate QR code for the obfuscated URL."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )

    # Use obfuscated URL for the QR code
    obfuscated_url = create_obfuscated_url(track_url)
    qr.add_data(obfuscated_url)

    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)


def create_qr_image(track_info, card_id):
    """Creates a simple QR code image for a track."""
    try:
        # Use a generic name for the QR file to avoid leaking track info
        safe_name = sanitize_filename(f"track_{card_id}")
        qr_image_path = f"hitster_{safe_name}_qr.png"

        # Generate simple QR code with no styling
        generate_qr_code(track_info['url'], qr_image_path)

        # Load the QR code as an image
        qr_img = Image.open(qr_image_path)

        return qr_img, qr_image_path

    except Exception as e:
        print(f"⚠️ Error creating QR for '{track_info['track']}': {e}")
        return None, None


def get_album_art(url):
    """Downloads album art from URL."""
    if not url:
        return None

    try:
        response = requests.get(url)
        return Image.open(BytesIO(response.content))
    except Exception as e:
        print(f"⚠️ Could not download album art: {e}")
        return None


def get_playlist_tracks(playlist_url):
    """Extracts track details from a Spotify playlist."""
    playlist_id = playlist_url.split("/")[-1].split("?")[0]  # Extract Playlist ID

    # Get playlist details for the title
    playlist_info = sp.playlist(playlist_id)
    playlist_name = playlist_info['name']
    playlist_owner = playlist_info['owner']['display_name']

    results = sp.playlist_tracks(playlist_id)

    tracks = []
    for item in results['items']:
        track = item['track']
        if not track:  # Skip if track is None (can happen with local files)
            continue

        track_name = track['name']
        artist_name = track['artists'][0]['name']
        album_name = track['album']['name']

        # Get the release date and format it
        raw_release_date = track['album']['release_date']
        release_date = format_release_date(raw_release_date)

        track_url = track['external_urls']['spotify']

        # Get album cover image
        album_img_url = None
        if track['album']['images']:
            album_img_url = track['album']['images'][0]['url']

        # Try to improve date accuracy using additional queries
        try:
            # For tracks with remastered in the name, try to find original release
            if "remaster" in track_name.lower() or "edition" in track_name.lower():
                # Search for the original track
                original_query = f"{artist_name} {track_name.split('(')[0].strip()}"
                search_results = sp.search(q=original_query, type='track', limit=5)

                # Check search results for older versions
                if search_results and search_results['tracks']['items']:
                    oldest_year = 9999
                    for result in search_results['tracks']['items']:
                        result_date = result['album']['release_date']
                        try:
                            result_year = int(result_date[:4])
                            if result_year < oldest_year:
                                oldest_year = result_year
                        except:
                            pass

                    if oldest_year < 9999 and oldest_year < int(release_date[:4]):
                        release_date = str(oldest_year)
        except Exception as e:
            print(f"Error finding original release date: {e}")

        tracks.append({
            "track": track_name,
            "artist": artist_name,
            "album": album_name,
            "release_date": release_date,
            "url": track_url,
            "album_img_url": album_img_url
        })

    return tracks, {"name": playlist_name, "owner": playlist_owner}


def clean_song_title(title):
    """Removes 'From...' and 'Remastered...' text and other common extras from song titles."""
    # List of patterns to remove
    patterns = [
        r' \(From .*?\)',  # (From Movie/Album)
        r' \- From .*?$',  # - From Movie/Album
        r' \(Remastered.*?\)',  # (Remastered...)
        r' \- Remastered.*?$',  # - Remastered...
        r' \[Remastered.*?\]',  # [Remastered...]
        r' \(.*?Anniversary.*?\)',  # (Anniversary Edition/Version)
        r' \(.*?Edition.*?\)',  # (Deluxe Edition, Special Edition)
        r' \(.*?Version.*?\)',  # (Radio Version, Extended Version)
        r' \(.*?Mix.*?\)',  # (Radio Mix, Club Mix)
        r' \(.*?Reissue.*?\)',  # (Reissue)
        r' \(Bonus Track\)',  # (Bonus Track)
    ]

    # Apply all patterns
    clean_title = title
    for pattern in patterns:
        import re
        clean_title = re.sub(pattern, '', clean_title)

    # Remove any trailing dashes or extra whitespace
    clean_title = clean_title.rstrip(' -')

    return clean_title.strip()


def generate_pdf(tracks, playlist_info, output_pdf="Hitster_cards.pdf", clean_temp_files=True):
    """Generates a PDF with alternating QR code and track info pages for easy double-sided printing."""
    import time  # Import time for adding delay

    c = canvas.Canvas(output_pdf, pagesize=letter)
    page_width, page_height = letter

    # Define grid properties
    rows, cols = 5, 3
    cards_per_page = rows * cols

    # Calculate how many pages we need
    total_pages = (len(tracks) + cards_per_page - 1) // cards_per_page

    # Calculate margins to center the grid
    margin_x = 50
    margin_y = 50

    # Calculate card dimensions based on page size and margins
    card_width = (page_width - (2 * margin_x)) / cols
    card_height = (page_height - (2 * margin_y)) / rows

    # Calculate QR code size (slightly smaller than card)
    qr_size = min(card_width, card_height) * 0.8

    # Clean song titles before generating cards
    for track in tracks:
        track['track'] = clean_song_title(track['track'])

    # Generate QR images for all tracks
    qr_images = []
    for idx, track in enumerate(tracks):
        qr_img, qr_path = create_qr_image(track, idx)
        if qr_img and qr_path:
            qr_images.append(qr_path)

    # Draw page borders and crop marks
    def draw_page_guides():
        # Crop marks in corners
        crop_mark_length = 15

        # Top-left
        c.line(0, page_height - margin_y, crop_mark_length, page_height - margin_y)
        c.line(margin_x, page_height, margin_x, page_height - crop_mark_length)

        # Top-right
        c.line(page_width - crop_mark_length, page_height - margin_y, page_width, page_height - margin_y)
        c.line(page_width - margin_x, page_height, page_width - margin_x, page_height - crop_mark_length)

        # Bottom-left
        c.line(0, margin_y, crop_mark_length, margin_y)
        c.line(margin_x, 0, margin_x, crop_mark_length)

        # Bottom-right
        c.line(page_width - crop_mark_length, margin_y, page_width, margin_y)
        c.line(page_width - margin_x, 0, page_width - margin_x, crop_mark_length)

        # Draw row guides
        for i in range(rows + 1):
            y = page_height - margin_y - (i * card_height)
            c.line(margin_x - 10, y, margin_x, y)  # Left
            c.line(page_width - margin_x, y, page_width - margin_x + 10, y)  # Right

        # Draw column guides
        for i in range(cols + 1):
            x = margin_x + (i * card_width)
            c.line(x, page_height - margin_y + 10, x, page_height - margin_y)  # Top
            c.line(x, margin_y, x, margin_y - 10)  # Bottom

    # Function to draw grid
    def draw_grid():
        # Draw horizontal lines
        for i in range(rows + 1):
            y = page_height - margin_y - (i * card_height)
            c.line(margin_x, y, page_width - margin_x, y)

        # Draw vertical lines
        for i in range(cols + 1):
            x = margin_x + (i * card_width)
            c.line(x, page_height - margin_y, x, margin_y)

    # Function to draw wrapped text
    def draw_wrapped_text(text, x, y, max_width, font_name, font_size, line_height=1.2):
        """Draw text wrapped to fit within max_width. Returns total height used."""
        c.setFont(font_name, font_size)
        words = text.split()
        lines = []
        current_line = ""

        for word in words:
            test_line = current_line + " " + word if current_line else word
            line_width = c.stringWidth(test_line, font_name, font_size)

            if line_width <= max_width:
                current_line = test_line
            else:
                lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

        # Calculate total height
        total_height = len(lines) * font_size * line_height

        # Draw each line
        line_y = y
        for line in lines:
            c.drawCentredString(x, line_y, line)
            line_y -= font_size * line_height

        return total_height

    # Generate pages in pairs (QR code page followed immediately by track info page)
    for page in range(total_pages):
        # Start index for tracks on this page
        start_idx = page * cards_per_page
        end_idx = min(start_idx + cards_per_page, len(tracks))

        # ------------------------
        # Page 1: QR codes
        # ------------------------
        c.setStrokeColorRGB(0, 0, 0)
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, page_width, page_height, fill=True)

        # Draw page guides and grid
        draw_page_guides()
        draw_grid()

        # Add a small page number in the corner
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(page_width - 40, 15, f"QR page {page + 1}/{total_pages}")

        # Place QR codes for this page
        for i in range(start_idx, end_idx):
            # Calculate position within the grid
            relative_idx = i - start_idx
            row = relative_idx // cols
            col = relative_idx % cols

            # Get QR path for this track
            qr_path = qr_images[i] if i < len(qr_images) else None

            if qr_path and os.path.exists(qr_path):
                # Calculate position for QR code
                x = margin_x + (col * card_width) + (card_width / 2) - (qr_size / 2)
                y = page_height - margin_y - (row * card_height) - (card_height / 2) + (qr_size / 2)

                # Draw the QR code
                c.drawImage(qr_path, x, y - qr_size, width=qr_size, height=qr_size)

        # End the QR page
        c.showPage()

        # ------------------------
        # Page 2: Track info (mirrored for double-sided printing)
        # ------------------------
        c.setStrokeColorRGB(0, 0, 0)
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, page_width, page_height, fill=True)

        # Draw page guides and grid
        draw_page_guides()
        draw_grid()

        # Add a small page number in the corner
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(page_width - 40, 15, f"Info page {page + 1}/{total_pages}")

        # Place track info for this page (mirrored for double-sided printing)
        for i in range(start_idx, end_idx):
            # Calculate position within the grid
            relative_idx = i - start_idx
            row = relative_idx // cols
            col = relative_idx % cols

            # Mirror the column position for proper alignment when printed double-sided
            mirrored_col = (cols - 1) - col

            # Get track data
            track = tracks[i]

            # Calculate position for text (centered in card)
            x = margin_x + (mirrored_col * card_width) + (card_width / 2)

            # Starting y position (near top of card)
            text_top = page_height - margin_y - (row * card_height) - (card_height * 0.2)
            y = text_top

            # Available width for text
            text_width = card_width * 0.9

            # Draw artist name (larger, bold)
            c.setFont("Helvetica-Bold", 12)
            c.setFillColorRGB(0, 0, 0)
            artist_text = track['artist']
            c.drawCentredString(x, y, artist_text)
            y -= 20  # Move down for track name

            # Draw track name (possibly multi-line)
            c.setFont("Helvetica", 10)
            track_text = track['track']
            track_height = draw_wrapped_text(track_text, x, y, text_width, "Helvetica", 10)
            y -= track_height + 10  # Move down past the track text plus some padding

            # Draw year (bigger than before)
            c.setFont("Helvetica-Bold", 14)
            c.drawCentredString(x, y, track['release_date'])

        # End the track info page (except for the last page)
        if page < total_pages - 1:
            c.showPage()

    # Save the PDF
    c.save()

    # Clean up temporary files with error handling
    if clean_temp_files:
        # Give a small delay to allow file handles to be released
        time.sleep(1)

        failed_files = []
        for qr_path in qr_images:
            if os.path.exists(qr_path):
                try:
                    os.remove(qr_path)
                except (PermissionError, OSError) as e:
                    print(f"Warning: Could not delete temporary file {qr_path}: {e}")
                    failed_files.append(qr_path)

        if failed_files:
            print(f"Could not delete {len(failed_files)} temporary files. These will need to be cleaned up manually.")
    else:
        print(
            f"{len(qr_images)} temporary QR code files were not deleted. You may want to manually clean them up later.")

    return output_pdf


def verify_release_date_with_musicbrainz(artist, title):
    """
    Query the MusicBrainz API to find the original release date for a track.

    Args:
        artist (str): The artist name
        title (str): The track title

    Returns:
        str: The release year if found, None otherwise
    """
    import requests
    import time
    from urllib.parse import quote

    # Set a user agent as required by MusicBrainz API
    headers = {
        'User-Agent': 'HitsterCardGenerator/1.0 ( github.com/wilgoy23/MyHitster1 )',
    }

    # Clean up the title further for searching
    clean_title = title.split('(')[0].split('[')[0].strip()

    # Encode the artist and title for URL
    encoded_artist = quote(artist)
    encoded_title = quote(clean_title)

    # Construct the URL
    url = f"https://musicbrainz.org/ws/2/recording/?query=recording:{encoded_title} AND artist:{encoded_artist}&fmt=json"

    try:
        # Make the request to MusicBrainz
        response = requests.get(url, headers=headers)

        # Respect rate limiting - MusicBrainz allows 1 request per second
        time.sleep(1)

        if response.status_code == 200:
            data = response.json()

            # Check if we got any recordings
            if data['recordings'] and len(data['recordings']) > 0:
                # Sort recordings by score (higher is better match)
                sorted_recordings = sorted(data['recordings'], key=lambda x: x.get('score', 0), reverse=True)

                # Try to find a release with a date
                for recording in sorted_recordings:
                    if 'releases' in recording:
                        # Look for the earliest release date
                        earliest_year = None

                        for release in recording['releases']:
                            if 'date' in release:
                                # Extract year from date (might be in YYYY-MM-DD format)
                                try:
                                    year = int(release['date'].split('-')[0])
                                    if earliest_year is None or year < earliest_year:
                                        earliest_year = year
                                except (ValueError, IndexError):
                                    continue

                        if earliest_year:
                            return str(earliest_year)

            return None
        else:
            print(f"MusicBrainz API error: {response.status_code}")
            return None

    except Exception as e:
        print(f"Error querying MusicBrainz: {e}")
        return None


def batch_verify_release_dates(tracks, max_requests=25):
    """
    Verify release dates for multiple tracks using MusicBrainz API.
    Limits the number of requests to avoid overloading the API.

    Args:
        tracks (list): List of track dictionaries
        max_requests (int): Maximum number of API requests to make

    Returns:
        dict: Dictionary mapping track indices to verified release years
    """
    print(f"Verifying release dates with MusicBrainz (limited to {max_requests} lookups)...")
    results = {}

    # Count how many tracks we've processed
    count = 0

    for i, track in enumerate(tracks):
        if count >= max_requests:
            print(f"Reached maximum of {max_requests} lookups. Stopping verification.")
            break

        artist = track['artist']
        title = track['track']
        current_year = track['release_date']

        # Try to parse the current year
        try:
            current_year_int = int(current_year)

            # Only verify if the year seems suspicious (too recent for an older artist, etc.)
            suspicious = False

            # Example heuristic: if it's after 2010 for well-known classic artists
            classic_artists = [
                'queen', 'led zeppelin', 'pink floyd', 'the beatles', 'rolling stones',
                'acdc', 'ac/dc', 'black sabbath', 'deep purple', 'bob dylan', 'david bowie',
                'the who', 'jimi hendrix', 'the doors', 'eagles', 'fleetwood mac'
            ]

            if (current_year_int > 2010 and
                    any(classic.lower() in artist.lower() for classic in classic_artists)):
                suspicious = True

            # Also verify tracks with unusually recent dates that might be reissues
            if current_year_int > 2020:
                suspicious = True

            # Skip if not suspicious
            if not suspicious:
                continue

        except ValueError:
            # If we can't parse the year, it's worth verifying
            pass

        # Increment the counter for each track we actually check
        count += 1

        print(f"Checking: {artist} - {title} (current: {current_year})...")
        verified_year = verify_release_date_with_musicbrainz(artist, title)

        if verified_year:
            if verified_year != current_year:
                print(f"  Found different year: {verified_year} (was: {current_year})")
                results[i] = verified_year
        else:
            print(f"  No reliable release date found")

    return results


if __name__ == "__main__":
    # Add the request library if not already imported at the top of the file
    try:
        import requests
    except ImportError:
        print("The 'requests' library is required for MusicBrainz verification.")
        print("Please install it with: pip install requests")
        exit(1)

    playlist_url = input("Enter Spotify playlist URL: ")
    tracks, playlist_info = get_playlist_tracks(playlist_url)

    if not tracks:
        print("No tracks found in playlist. Please check the URL and try again.")
    else:
        print(f"\nFound {len(tracks)} tracks in playlist: {playlist_info['name']}")

        # Clean up song titles to remove "(Remastered)" and "(From...)" text
        for track in tracks:
            original_title = track['track']
            cleaned_title = clean_song_title(original_title)
            if original_title != cleaned_title:
                track['track'] = cleaned_title
                print(f"Cleaned title: '{original_title}' -> '{cleaned_title}'")

        # Ask about using MusicBrainz for date verification
        use_musicbrainz = input(
            "\nWould you like to verify release dates using MusicBrainz? (y/n): ").lower().strip() == 'y'

        if use_musicbrainz:
            # Ask for max number of lookups
            max_lookups = 25  # Default
            try:
                user_max = input("Maximum number of tracks to verify (default: 25): ").strip()
                if user_max:
                    max_lookups = int(user_max)
            except ValueError:
                print("Invalid number, using default of 25")

            # Verify dates
            verified_dates = batch_verify_release_dates(tracks, max_requests=max_lookups)

            # Apply verified dates
            if verified_dates:
                apply_verified = input(
                    f"\nApply {len(verified_dates)} verified release dates? (y/n): ").lower().strip() == 'y'
                if apply_verified:
                    for idx, year in verified_dates.items():
                        tracks[idx]['release_date'] = year
                    print("Verified dates applied!")

        # Ask for date range constraints
        print("\nYou can set a valid date range for your playlist.")
        use_date_range = input("Would you like to set a valid date range? (y/n): ").lower().strip() == 'y'

        min_year = 0
        max_year = 3000

        if use_date_range:
            while True:
                try:
                    min_year = int(input("Enter minimum year (e.g., 1960): ").strip())
                    if 1900 <= min_year <= 2100:
                        break
                    else:
                        print("Please enter a reasonable year between 1900 and 2100.")
                except ValueError:
                    print("Please enter a valid year (numbers only).")

            while True:
                try:
                    max_year = int(input("Enter maximum year (e.g., 1990): ").strip())
                    if min_year <= max_year <= 2100:
                        break
                    else:
                        print(f"Please enter a year between {min_year} and 2100.")
                except ValueError:
                    print("Please enter a valid year (numbers only).")

            # Find tracks outside the specified range
            tracks_to_review = []
            for i, track in enumerate(tracks):
                try:
                    year = int(track['release_date'])
                    if year < min_year or year > max_year:
                        tracks_to_review.append((i, track))
                except ValueError:
                    # If release_date isn't a valid number, add it for review
                    tracks_to_review.append((i, track))

            if tracks_to_review:
                print(f"\nFound {len(tracks_to_review)} tracks outside the {min_year}-{max_year} range.")
                edit_years = input(
                    "Would you like to review and edit these release years? (y/n): ").lower().strip() == 'y'

                if edit_years:
                    print(
                        "\nReviewing tracks outside the specified range. Press Enter to keep the current year, or enter a new year.")
                    for i, track in tracks_to_review:
                        current_year = track['release_date']
                        artist = track['artist']
                        title = track['track']

                        # Truncate long titles for display
                        if len(title) > 40:
                            title = title[:37] + "..."

                        # Display track info and current year
                        print(f"\n{i + 1}. {artist} - {title}")

                        # Show why this track is being reviewed
                        try:
                            year_int = int(current_year)
                            if year_int < min_year:
                                print(f"   Current year: {current_year} (below minimum {min_year})")
                            elif year_int > max_year:
                                print(f"   Current year: {current_year} (above maximum {max_year})")
                        except ValueError:
                            print(f"   Current year: {current_year} (not a valid year)")

                        new_year = input(f"   New year (or Enter to keep): ").strip()

                        # Update the year if the user entered something
                        if new_year:
                            tracks[i]['release_date'] = new_year
                            print(f"   Updated to: {new_year}")

                    print("\nYear editing complete!")
                else:
                    print("Continuing without editing years.")
            else:
                print(f"All tracks are within the {min_year}-{max_year} range. No editing needed.")

        # Try to generate PDF with temporary file cleanup
        try:
            pdf_file = generate_pdf(tracks, playlist_info, clean_temp_files=True)
            print(f"\n🎸 Hitster cards generated in '{pdf_file}'")
            print(f"Total tracks processed: {len(tracks)}")
            print("For best results, print double-sided with 'Flip on short edge' setting.")
        except Exception as e:
            print(f"\nThere was an issue generating the PDF with cleanup: {e}")
            print("Trying again without cleaning up temporary files...")

            # Try again without cleanup if there was an error
            pdf_file = generate_pdf(tracks, playlist_info, clean_temp_files=False)
            print(f"\n🎸 Hitster cards generated in '{pdf_file}'")
            print(f"Total tracks processed: {len(tracks)}")
            print("For best results, print double-sided with 'Flip on short edge' setting.")
            print("Note: Temporary QR code files were not deleted. You may want to manually clean them up later.")