//! Fast M3U / M3U8 (IPTV "extended M3U") playlist parser.

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Live,
    Movie,
    Series,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub url: String,
    pub group: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub logo: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tvg_id: String,
    pub kind: Kind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catchup_days: Option<u32>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub epg_url: Option<String>,
    pub entries: Vec<Entry>,
}

/// Extract the value of `key="..."` (or `key=value`) from an attribute string.
fn attr<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let mut search = 0;
    while let Some(pos) = line[search..].find(key) {
        let start = search + pos;
        let after = start + key.len();
        // must be a whole attribute name
        let boundary =
            start == 0 || matches!(line.as_bytes()[start - 1], b' ' | b'\t' | b':' | b',');
        if boundary && line[after..].starts_with('=') {
            let v = &line[after + 1..];
            if let Some(stripped) = v.strip_prefix('"') {
                return stripped.find('"').map(|end| &stripped[..end]);
            }
            let end = v.find([' ', ',']).unwrap_or(v.len());
            return Some(&v[..end]);
        }
        search = after;
    }
    None
}

/// Find the comma that separates attributes from the display title,
/// ignoring commas inside quoted attribute values.
fn title_split(line: &str) -> Option<usize> {
    let mut in_quotes = false;
    for (i, b) in line.bytes().enumerate() {
        match b {
            b'"' => in_quotes = !in_quotes,
            b',' if !in_quotes => return Some(i),
            _ => {}
        }
    }
    None
}

fn classify(url: &str) -> Kind {
    let lower = url.to_ascii_lowercase();
    if lower.contains("/series/") {
        return Kind::Series;
    }
    if lower.contains("/movie/") {
        return Kind::Movie;
    }
    let path = lower.split(['?', '#']).next().unwrap_or("");
    const VOD_EXT: [&str; 8] = [
        ".mp4", ".mkv", ".avi", ".mov", ".m4v", ".wmv", ".webm", ".flv",
    ];
    if VOD_EXT.iter().any(|e| path.ends_with(e)) {
        Kind::Movie
    } else {
        Kind::Live
    }
}

pub fn parse(text: &str) -> Playlist {
    let mut pl = Playlist::default();
    let mut pending: Option<(String, String, String, String, Option<u32>)> = None;
    let mut ext_grp: Option<String> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTM3U") {
            pl.epg_url = attr(rest, "url-tvg")
                .or_else(|| attr(rest, "x-tvg-url"))
                .and_then(|s| s.split(',').next())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            let (attrs, title) = match title_split(rest) {
                Some(i) => (&rest[..i], rest[i + 1..].trim()),
                None => (rest, ""),
            };
            let name = if title.is_empty() {
                attr(attrs, "tvg-name").unwrap_or("Untitled").to_string()
            } else {
                title.to_string()
            };
            let group = attr(attrs, "group-title").unwrap_or("").to_string();
            let logo = attr(attrs, "tvg-logo").unwrap_or("").to_string();
            let tvg_id = attr(attrs, "tvg-id").unwrap_or("").to_string();
            let catchup = attr(attrs, "catchup-days")
                .or_else(|| attr(attrs, "tvg-rec"))
                .and_then(|v| v.parse().ok())
                .filter(|d| *d > 0);
            pending = Some((name, group, logo, tvg_id, catchup));
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTGRP:") {
            ext_grp = Some(rest.trim().to_string());
            continue;
        }
        if line.starts_with('#') {
            continue;
        }

        // A URL line.
        let (name, mut group, logo, tvg_id, catchup_days) = pending.take().unwrap_or_else(|| {
            (
                line.to_string(),
                String::new(),
                String::new(),
                String::new(),
                None,
            )
        });
        if group.is_empty() {
            group = ext_grp.take().unwrap_or_else(|| "Uncategorised".into());
        }
        pl.entries.push(Entry {
            kind: classify(line),
            name,
            url: line.to_string(),
            group,
            logo,
            tvg_id,
            catchup_days,
        });
    }
    pl
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_extended_m3u() {
        let src = r#"#EXTM3U url-tvg="http://epg.example.com/guide.xml"
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One" tvg-logo="http://l/bbc1.png" group-title="UK, Entertainment",BBC One HD
http://example.com/live/u/p/1.ts
#EXTINF:-1 group-title="Movies",The Film (2020)
http://example.com/movie/u/p/2.mkv
#EXTINF:-1 group-title="Shows",Show S01 E02
http://example.com/series/u/p/3.mp4
"#;
        let pl = parse(src);
        assert_eq!(
            pl.epg_url.as_deref(),
            Some("http://epg.example.com/guide.xml")
        );
        assert_eq!(pl.entries.len(), 3);
        assert_eq!(pl.entries[0].name, "BBC One HD");
        assert_eq!(pl.entries[0].group, "UK, Entertainment");
        assert_eq!(pl.entries[0].tvg_id, "bbc1.uk");
        assert_eq!(pl.entries[0].kind, Kind::Live);
        assert_eq!(pl.entries[1].kind, Kind::Movie);
        assert_eq!(pl.entries[2].kind, Kind::Series);
    }
}
