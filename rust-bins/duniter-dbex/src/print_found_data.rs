//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use crate::*;

const KEY_COLUMN_NAME: &str = "Key";
const VALUE_COLUMN_NAME: &str = "Value";

pub struct DataToShow {
    pub entries: Vec<EntryFound>,
    pub keys_only: bool,
    pub only_properties: Vec<String>,
}

pub fn print_found_data<W: Write>(
    output: &mut W,
    output_format: OutputFormat,
    pretty_json: bool,
    dynamic_content_arrangement: bool,
    data_to_show: DataToShow,
    captures_names: Vec<String>,
) -> std::io::Result<()> {
    let DataToShow {
        entries,
        keys_only,
        only_properties,
    } = data_to_show;
    if entries.is_empty() {
        return Ok(());
    }

    let only_properties_set = if !only_properties.is_empty() {
        HashSet::from_iter(only_properties.into_iter())
    } else {
        HashSet::with_capacity(0)
    };

    match output_format {
        OutputFormat::Json => {
            let json_array = if keys_only {
                entries
                    .into_par_iter()
                    .map(|entry| key_to_json(entry.key))
                    .collect()
            } else {
                entries
                    .into_par_iter()
                    .map(|entry| entry_to_json(&only_properties_set, &captures_names, entry))
                    .collect()
            };
            if pretty_json {
                writeln!(output, "{:#}", Value::Array(json_array))
            } else {
                writeln!(output, "{}", Value::Array(json_array))
            }
        }
        OutputFormat::Table => {
            // If value is not an object or an array of objects, force raw output format
            let mut entries_iter = entries.iter();
            let first_object_opt = if keys_only {
                None
            } else {
                loop {
                    if let Some(EntryFound { value, .. }) = entries_iter.next() {
                        if let Value::Array(ref json_array) = value {
                            if json_array.is_empty() {
                                continue;
                            } else {
                                break json_array[0].as_object();
                            }
                        } else {
                            break value.as_object();
                        }
                    } else {
                        // All values are empty array, force raw output format
                        break None;
                    }
                }
            };

            let properties_names = if let Some(first_object) = first_object_opt {
                if only_properties_set.is_empty() {
                    first_object.keys().cloned().collect::<HashSet<String>>()
                } else {
                    first_object
                        .keys()
                        .filter(|property_name| {
                            only_properties_set.contains(property_name.as_str())
                        })
                        .cloned()
                        .collect::<HashSet<String>>()
                }
            } else {
                return print_found_data(
                    output,
                    OutputFormat::TableJson,
                    pretty_json,
                    dynamic_content_arrangement,
                    print_found_data::DataToShow {
                        entries,
                        keys_only,
                        only_properties: vec![],
                    },
                    captures_names,
                );
            };

            // Create table
            let mut table = Table::new();
            if dynamic_content_arrangement {
                table.set_content_arrangement(comfy_table::ContentArrangement::Dynamic);
            }

            // Map data by property
            let entries_map: Vec<HashMap<String, String>> = entries
                .into_par_iter()
                .map(|entry| entry_to_rows(&only_properties_set, &captures_names, entry))
                .flatten()
                .collect();

            // Define table headers
            let mut headers = Vec::with_capacity(1 + properties_names.len() + captures_names.len());
            headers.push(KEY_COLUMN_NAME.to_owned());
            if !keys_only {
                for property_name in properties_names {
                    headers.push(property_name);
                }
                headers.sort_by(|a, b| {
                    if a == KEY_COLUMN_NAME {
                        std::cmp::Ordering::Less
                    } else if b == KEY_COLUMN_NAME {
                        std::cmp::Ordering::Greater
                    } else {
                        a.cmp(b)
                    }
                });
                headers.extend(captures_names);
            }
            table.set_header(&headers);

            // Fill table
            for properties_values in entries_map {
                let mut row = SmallVec::<[&str; 8]>::new();
                for column_name in &headers {
                    if let Some(property_value) = properties_values.get(column_name) {
                        row.push(property_value.as_str());
                    } else {
                        row.push("")
                    }
                }
                table.add_row(row);
            }

            // Print table
            writeln!(output, "{}", table)
        }
        OutputFormat::TableJson => {
            let mut table = Table::new();
            if dynamic_content_arrangement {
                table.set_content_arrangement(comfy_table::ContentArrangement::Dynamic);
            }
            let mut headers = Vec::with_capacity(2 + captures_names.len());
            headers.push(KEY_COLUMN_NAME);
            if !keys_only {
                headers.push(VALUE_COLUMN_NAME);
            }
            headers.extend(captures_names.iter().map(String::as_str));
            table.set_header(headers);
            for EntryFound {
                key,
                value,
                captures: captures_opt,
            } in entries
            {
                let mut row = Vec::with_capacity(2 + captures_names.len());
                row.push(key);
                if keys_only {
                    table.add_row(row);
                } else {
                    if pretty_json {
                        row.push(format!("{:#}", value));
                    } else {
                        row.push(value.to_string());
                    }
                    let rows = caps_to_rows(row, &captures_names[..], captures_opt);
                    for row in rows {
                        table.add_row(row);
                    }
                }
            }
            writeln!(output, "{}", table)
        }
        _ => todo!(),
    }
}

#[inline(always)]
fn key_to_json(key: String) -> Value {
    Value::String(key)
}

fn entry_to_json(
    only_properties_set: &HashSet<String>,
    captures_names: &[String],
    entry: EntryFound,
) -> Value {
    let EntryFound {
        key,
        mut value,
        captures: captures_opt,
    } = entry;
    if !only_properties_set.is_empty() {
        match value {
            Value::Object(ref mut json_map) => {
                let mut properties_to_rm = SmallVec::<[String; 64]>::new();
                for property_name in json_map.keys() {
                    if !only_properties_set.contains(property_name) {
                        properties_to_rm.push(property_name.clone());
                    }
                }
                for property_name in properties_to_rm {
                    json_map.remove(&property_name);
                }
            }
            Value::Array(ref mut json_array) => {
                for sub_value in json_array {
                    if let Value::Object(ref mut json_map) = sub_value {
                        let mut properties_to_rm = SmallVec::<[String; 64]>::new();
                        for property_name in json_map.keys() {
                            if !only_properties_set.contains(property_name) {
                                properties_to_rm.push(property_name.clone());
                            }
                        }
                        for property_name in properties_to_rm {
                            json_map.remove(&property_name);
                        }
                    }
                }
            }
            _ => (),
        }
    }
    let mut json_map = Map::with_capacity(2);
    json_map.insert("key".to_owned(), Value::String(key));
    json_map.insert("value".to_owned(), value);
    if !captures_names.is_empty() {
        let mut captures_objects = Vec::new();
        if let Some(ValueCaptures(captures)) = captures_opt {
            for capture in captures {
                let mut capture_object = Map::with_capacity(captures_names.len());
                for (i, capture_group_value_opt) in capture.into_iter().enumerate() {
                    if let Some(capture_group_value) = capture_group_value_opt {
                        capture_object.insert(
                            captures_names[i].to_owned(),
                            Value::String(capture_group_value),
                        );
                    }
                }
                captures_objects.push(Value::Object(capture_object));
            }
        }
        json_map.insert("captures".to_owned(), Value::Array(captures_objects));
    }
    Value::Object(json_map)
}

fn entry_to_rows(
    only_properties_set: &HashSet<String>,
    captures_names: &[String],
    entry: EntryFound,
) -> Vec<HashMap<String, String>> {
    let EntryFound {
        key,
        value,
        captures: captures_opt,
    } = entry;
    match value {
        Value::Object(value_json_map) => {
            let row_map = map_entry_by_properties(&only_properties_set, key, value_json_map);
            caps_to_rows_maps(row_map, captures_names, captures_opt)
        }
        Value::Array(json_array) => json_array
            .into_iter()
            .map(|sub_value| {
                if let Value::Object(sub_value_json_map) = sub_value {
                    map_entry_by_properties(&only_properties_set, key.clone(), sub_value_json_map)
                } else {
                    unreachable!()
                }
            })
            .collect(),
        _ => unreachable!(),
    }
}

fn map_entry_by_properties(
    only_properties_set: &HashSet<String>,
    k: String,
    value_json_map: Map<String, Value>,
) -> HashMap<String, String> {
    let mut row_map = HashMap::with_capacity(1 + value_json_map.len());
    row_map.insert(KEY_COLUMN_NAME.to_owned(), k);
    for (property_name, property_value) in value_json_map {
        if only_properties_set.is_empty() || only_properties_set.contains(&property_name) {
            if let Value::String(property_value_string) = property_value {
                row_map.insert(property_name, property_value_string);
            } else {
                row_map.insert(property_name, property_value.to_string());
            }
        }
    }
    row_map
}

fn caps_to_rows(
    mut first_row_begin: Vec<String>,
    captures_names: &[String],
    captures_opt: Option<ValueCaptures>,
) -> SmallVec<[Vec<String>; 2]> {
    if !captures_names.is_empty() {
        if let Some(ValueCaptures(captures)) = captures_opt {
            let first_row_begin_len = first_row_begin.len();
            let mut rows = SmallVec::with_capacity(captures.len());
            let mut current_row = first_row_begin;
            for capture in captures {
                for capture_group_value_opt in capture.into_iter() {
                    if let Some(capture_group_value) = capture_group_value_opt {
                        current_row.push(capture_group_value);
                    } else {
                        current_row.push(String::new());
                    }
                }
                rows.push(current_row);
                current_row = (0..first_row_begin_len).map(|_| String::new()).collect();
            }
            rows
        } else {
            first_row_begin.extend((0..captures_names.len()).map(|_| String::new()));
            smallvec![first_row_begin]
        }
    } else {
        smallvec![first_row_begin]
    }
}

fn caps_to_rows_maps(
    first_row_map_begin: HashMap<String, String>,
    captures_names: &[String],
    captures_opt: Option<ValueCaptures>,
) -> Vec<HashMap<String, String>> {
    if !captures_names.is_empty() {
        if let Some(ValueCaptures(captures)) = captures_opt {
            let mut rows = Vec::with_capacity(captures.len());
            let mut current_row_map = first_row_map_begin;
            for capture in captures {
                for (i, capture_group_value_opt) in capture.into_iter().enumerate() {
                    if let Some(capture_group_value) = capture_group_value_opt {
                        current_row_map.insert(captures_names[i].to_owned(), capture_group_value);
                    }
                }
                rows.push(current_row_map);
                current_row_map = HashMap::with_capacity(captures_names.len());
            }
            rows
        } else {
            vec![first_row_map_begin]
        }
    } else {
        vec![first_row_map_begin]
    }
}
