export default `query AssemblySymmetry($pdbId: String!) {
    assemblies(pdbId: $pdbId) {
        pdbx_struct_assembly {
            id
        }
        rcsb_struct_symmetry {
            clusters {
                avg_rmsd
                members {
                    asym_id
                    pdbx_struct_oper_list_ids
                }
            }
            kind
            oligomeric_state
            rotation_axes {
                start
                end
                order
            }
            stoichiometry
            symbol
            type
        }
    }
}`