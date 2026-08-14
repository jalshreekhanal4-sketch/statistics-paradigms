(* statistics.ml - mean, median and mode of a list of integers.

   Functional implementation for MSCS-632. Every value here is immutable:
   there are no references, no mutable record fields, and no loops. The whole
   program is expressions composed out of higher-order list functions
   (fold_left, map, filter, sort), and each statistic is a pure function of its
   argument.

   Build: ocamlfind ocamlopt -package str statistics.ml -o statistics
     or simply: ocaml statistics.ml
   Usage: ./statistics [int ...]      (with no arguments a sample set is used) *)

(* Deliberately bimodal, so [modes] has to return more than one value. *)
let sample_data = [ 4; 1; 2; 2; 3; 5; 4; 2; 7; 4 ]

(* Mean. Returns an option because the empty list has no mean; making that
   explicit in the type stops a caller from ignoring the case. *)
let mean (values : int list) : float option =
  match values with
  | [] -> None
  | _ ->
      let total = List.fold_left ( + ) 0 values in
      let count = List.length values in
      Some (float_of_int total /. float_of_int count)

(* Median. Sorting returns a new list rather than reordering the argument, so
   the caller's list is untouched. With an even count the two middle values are
   averaged. *)
let median (values : int list) : float option =
  match values with
  | [] -> None
  | _ ->
      let sorted = List.sort compare values in
      let n = List.length sorted in
      let mid = n / 2 in
      if n mod 2 = 1 then Some (float_of_int (List.nth sorted mid))
      else
        let lower = float_of_int (List.nth sorted (mid - 1)) in
        let upper = float_of_int (List.nth sorted mid) in
        Some ((lower +. upper) /. 2.0)

(* Frequency table as an association list, accumulated with a fold. The
   accumulator is rebuilt on each step rather than updated in place, which is
   what makes this usable without any mutable state. *)
let frequencies (values : int list) : (int * int) list =
  List.fold_left
    (fun table x ->
      match List.assoc_opt x table with
      | Some count -> (x, count + 1) :: List.remove_assoc x table
      | None -> (x, 1) :: table)
    [] values

(* Mode. A set may be multimodal, so this returns every value tied for the
   highest frequency, together with that frequency.

   The pipeline reads directly as the definition: build the table, find the
   largest count, keep the entries matching it, discard the counts, sort. *)
let modes (values : int list) : int list * int =
  match frequencies values with
  | [] -> ([], 0)
  | table ->
      let best = List.fold_left (fun acc (_, count) -> max acc count) 0 table in
      let winners =
        table
        |> List.filter (fun (_, count) -> count = best)
        |> List.map fst
        |> List.sort compare
      in
      (winners, best)

(* ---- presentation ---- *)

let string_of_int_list (values : int list) : string =
  "[" ^ String.concat ", " (List.map string_of_int values) ^ "]"

let describe_float (label : string) (value : float option) : string =
  match value with
  | None -> Printf.sprintf "%-15s undefined (empty list)" label
  | Some v -> Printf.sprintf "%-15s %.4f" label v

let describe_modes (values : int list) : string =
  match modes values with
  | [], _ -> Printf.sprintf "%-15s undefined (empty list)" "Mode:"
  | winners, frequency ->
      Printf.sprintf "%-15s %s  (each occurring %d time%s%s)" "Mode:"
        (String.concat ", " (List.map string_of_int winners))
        frequency
        (if frequency = 1 then "" else "s")
        (if List.length winners > 1 then "; the set is multimodal" else "")

(* Parse the command line into a list of ints. The fold carries a Result, so
   the first bad argument short-circuits the rest without an exception. *)
let parse_args (args : string list) : (int list, string) result =
  List.fold_left
    (fun acc text ->
      match (acc, int_of_string_opt text) with
      | Error e, _ -> Error e
      | Ok xs, Some v -> Ok (v :: xs)
      | Ok _, None -> Error text)
    (Ok []) args
  |> Result.map List.rev

let run (values : int list) : unit =
  print_endline (Printf.sprintf "%-15s %s" "Input:" (string_of_int_list values));
  print_endline
    (Printf.sprintf "%-15s %s" "Sorted:"
       (string_of_int_list (List.sort compare values)));
  print_newline ();
  print_endline (Printf.sprintf "%-15s %d" "Count:" (List.length values));
  print_endline (describe_float "Mean:" (mean values));
  print_endline (describe_float "Median:" (median values));
  print_endline (describe_modes values)

let () =
  let args = List.tl (Array.to_list Sys.argv) in
  if args = [] then (
    print_endline "No input given; using the built-in sample set.\n";
    run sample_data)
  else
    match parse_args args with
    | Ok values -> run values
    | Error bad ->
        prerr_endline (Printf.sprintf "error: '%s' is not a valid integer" bad);
        exit 1
